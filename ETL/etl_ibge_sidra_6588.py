"""
ETL — Tabela 1612 (SIDRA / IBGE) — Produção agrícola municipal (lavouras temporárias).

Extrai as folhas principais do Excel exportado pelo IBGE, normaliza símbolos oficiais,
converte valores numéricos e devolve um conjunto *tidy* (formato longo).

Suporta:
- Export completo SIDRA (nomes longos, ex. «Quantidade produzida», «Valor da produção»).
- `TCC-IBGE.xlsx` (layout enxuto: Área plantada/colhida, «Produção (Toneladas)», Rendimento médio;
  sem folha de valor da produção — essa variável é omitida).

Requisitos: ver `requirements.txt` na mesma pasta.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
import gzip
import json
import os
import re
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configuração — folhas principais (exclui folhas de % e "Notas")
# ---------------------------------------------------------------------------

# (rótulo Variavel no CSV tidy, predicado(nome_folha), obrigatória?)
VAR_PLANTED_KEY = "area plantada (hectares)"
VAR_HARVESTED_KEY = "area colhida (hectares)"
VAR_QTY_KEY = "quantidade produzida (toneladas)"
VAR_YIELD_KEY = "rendimento medio da producao (quilogramas por hectare)"
MONTH_NAME_TO_NUM = {
    "janeiro": "01",
    "fevereiro": "02",
    "marco": "03",
    "abril": "04",
    "maio": "05",
    "junho": "06",
    "julho": "07",
    "agosto": "08",
    "setembro": "09",
    "outubro": "10",
    "novembro": "11",
    "dezembro": "12",
}

# Código IBGE da UF (2 dígitos no início do código de município de 7 dígitos) → sigla
IBGE_UF_NUM_TO_SIGLA: dict[int, str] = {
    11: "RO",
    12: "AC",
    13: "AM",
    14: "RR",
    15: "PA",
    16: "AP",
    17: "TO",
    21: "MA",
    22: "PI",
    23: "CE",
    24: "RN",
    25: "PB",
    26: "PE",
    27: "AL",
    28: "SE",
    29: "BA",
    31: "MG",
    32: "ES",
    33: "RJ",
    35: "SP",
    41: "PR",
    42: "SC",
    43: "RS",
    50: "MS",
    51: "MT",
    52: "GO",
    53: "DF",
}

UF_SIGLA_TO_NOME_PT: dict[str, str] = {
    "RO": "Rondônia",
    "AC": "Acre",
    "AM": "Amazonas",
    "RR": "Roraima",
    "PA": "Pará",
    "AP": "Amapá",
    "TO": "Tocantins",
    "MA": "Maranhão",
    "PI": "Piauí",
    "CE": "Ceará",
    "RN": "Rio Grande do Norte",
    "PB": "Paraíba",
    "PE": "Pernambuco",
    "AL": "Alagoas",
    "SE": "Sergipe",
    "BA": "Bahia",
    "MG": "Minas Gerais",
    "ES": "Espírito Santo",
    "RJ": "Rio de Janeiro",
    "SP": "São Paulo",
    "PR": "Paraná",
    "SC": "Santa Catarina",
    "RS": "Rio Grande do Sul",
    "MS": "Mato Grosso do Sul",
    "MT": "Mato Grosso",
    "GO": "Goiás",
    "DF": "Distrito Federal",
}


def _sigla_from_ibge_uf_id(uf_id: int) -> str | None:
    return IBGE_UF_NUM_TO_SIGLA.get(int(uf_id))


def infer_uf_sigla_from_territorio_cell(
    raw: object,
    *,
    default_uf_id: int | None,
    default_uf_nome: str,
) -> str | None:
    """Infere sigla UF a partir de código IBGE (7 dígitos), linha UF (2 dígitos) ou nome; fallback UF do ficheiro."""
    cod = _municipio_codigo_from_cell(raw)
    if cod:
        prefix = int(cod[:2])
        return IBGE_UF_NUM_TO_SIGLA.get(prefix)

    k = _normalize_geo_key(raw)
    if k.isdigit() and len(k) == 2:
        sig = IBGE_UF_NUM_TO_SIGLA.get(int(k))
        if sig:
            return sig

    nome = clean_municipio_label(raw)
    if nome and default_uf_nome.strip() and nome.strip().lower() == default_uf_nome.strip().lower():
        if default_uf_id is not None:
            return _sigla_from_ibge_uf_id(int(default_uf_id))

    for sigla, nome_of in UF_SIGLA_TO_NOME_PT.items():
        if nome and nome.strip().lower() == nome_of.lower():
            return sigla

    if default_uf_id is not None:
        return _sigla_from_ibge_uf_id(int(default_uf_id))

    return None


def aggregate_sidra_long_to_uf_level(
    df: pd.DataFrame,
    *,
    default_uf_id: int | None,
    default_uf_nome: str,
) -> pd.DataFrame:
    """
    Agrega linhas municipais para uma linha por (Ano, UF, Produto, Variável).
    Áreas, quantidades e valores: soma. Rendimento médio (kg/ha): recalculado a partir dos totais
    (produção em t × 1000 / área em ha), coerente com a tabela SIDRA agregada.
    """
    if df.empty:
        return df

    work = df.copy()
    work["_uf"] = work["Município"].map(
        lambda m: infer_uf_sigla_from_territorio_cell(m, default_uf_id=default_uf_id, default_uf_nome=default_uf_nome)
    )
    work = work.dropna(subset=["_uf"])
    if work.empty:
        return pd.DataFrame(columns=["Ano", "Periodo", "Município", "Produto_Agrícola", "Variavel", "Valor"])

    ext = work[work["Variavel"] != VAR_YIELD_KEY].copy()
    summed = ext.groupby(["Ano", "Periodo", "_uf", "Produto_Agrícola", "Variavel"], as_index=False)["Valor"].sum()

    out_rows: list[dict] = []
    for (ano, periodo, uf_sigla, produto), sub in summed.groupby(["Ano", "Periodo", "_uf", "Produto_Agrícola"], sort=False):
        vm: dict[str, float] = {}
        for _, r in sub.iterrows():
            vk = str(r["Variavel"]).strip()
            v = r["Valor"]
            if pd.notna(v):
                vm[vk] = float(v)
        nome_estado = UF_SIGLA_TO_NOME_PT.get(str(uf_sigla), str(uf_sigla))
        ano_i = int(float(ano)) if pd.notna(ano) else ano
        for vk, val in vm.items():
            out_rows.append(
                {
                    "Ano": ano_i,
                    "Periodo": periodo,
                    "Município": nome_estado,
                    "Produto_Agrícola": produto,
                    "Variavel": vk,
                    "Valor": val,
                }
            )
        qty = vm.get(VAR_QTY_KEY)
        pl = vm.get(VAR_PLANTED_KEY)
        hc = vm.get(VAR_HARVESTED_KEY)
        area = None
        if pl is not None and pl > 0:
            area = pl
        elif hc is not None and hc > 0:
            area = hc
        elif pl is not None:
            area = pl
        elif hc is not None:
            area = hc
        if qty is not None and area is not None and area > 0 and qty >= 0:
            y_kg_ha = (qty * 1000.0) / float(area)
            out_rows.append(
                {
                    "Ano": ano_i,
                    "Periodo": periodo,
                    "Município": nome_estado,
                    "Produto_Agrícola": produto,
                    "Variavel": VAR_YIELD_KEY,
                    "Valor": y_kg_ha,
                }
            )

    out = pd.DataFrame(out_rows)
    if out.empty:
        return pd.DataFrame(columns=["Ano", "Periodo", "Município", "Produto_Agrícola", "Variavel", "Valor"])
    return out


SHEET_SPECS: list[tuple[str, Callable[[str], bool], bool]] = [
    ("area plantada (hectares)", lambda n: _sheet_match(n, "área plantada", "hectares"), True),
    ("area colhida (hectares)", lambda n: _sheet_match(n, "área colhida", "hectares"), True),
    (
        "quantidade produzida (toneladas)",
        lambda n: _sheet_main_var_no_percent(n, "quantidade produzida")
        or (
            "percentual" not in n.casefold()
            and "toneladas" in n.casefold()
            and ("produção" in n.casefold() or "producao" in n.casefold())
        ),
        True,
    ),
    (
        "rendimento medio da producao (quilogramas por hectare)",
        lambda n: _sheet_main_var_no_percent(n, "rendimento médio")
        or _sheet_main_var_no_percent(n, "rendimento medio")
        or (
            "percentual" not in n.casefold()
            and "rendimento" in n.casefold()
            and ("quilograma" in n.casefold() or "quilo" in n.casefold())
        ),
        True,
    ),
    ("valor da producao (mil reais)", lambda n: _sheet_match(n, "valor da produção", "mil reais"), False),
]


def _sheet_match(name: str, must_contain_a: str, must_contain_b: str) -> bool:
    n = name.casefold()
    return (
        must_contain_a.casefold() in n
        and must_contain_b.casefold() in n
        and "percentual" not in n
    )


def _sheet_main_var_no_percent(name: str, phrase: str) -> bool:
    """Identifica folha principal quando o Excel trunca o subtítulo (ex.: Toneladas / Hectare)."""
    n = name.casefold()
    return phrase.casefold() in n and "percentual" not in n


def _resolve_sheets(xl: pd.ExcelFile) -> list[tuple[str, str]]:
    """Devolve lista (nome_folha_excel, variavel_normalizada). Folhas opcionais ausentes são ignoradas."""
    out: list[tuple[str, str]] = []
    for variavel_label, pred, required in SHEET_SPECS:
        hit = next((s for s in xl.sheet_names if pred(s)), None)
        if hit is None:
            if required:
                raise ValueError(
                    f"Não foi encontrada folha compatível com variável '{variavel_label}'. "
                    f"Folhas disponíveis: {xl.sheet_names}"
                )
            continue
        out.append((hit, variavel_label))
    return out


# ---------------------------------------------------------------------------
# Limpeza IBGE
# ---------------------------------------------------------------------------

_NULL_SYMBOLS = frozenset({"...", "..", "X", "x", "…"})
_ZERO_SYMBOLS = frozenset({"-"})


def clean_product_label(raw: object) -> str:
    """Remove espaços extras; minúsculas padronizadas (preserva conteúdo útil)."""
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return ""
    t = str(raw).strip()
    t = re.sub(r"\s+", " ", t)
    return t.casefold()


def clean_municipio_label(raw: object) -> str:
    """Só trim — mantém códigos IBGE e capitalização originais."""
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return ""
    return str(raw).strip()


def _normalize_geo_key(raw: object) -> str:
    """Converte célula do Excel (int/float/str) para string de dígitos ou texto estável."""
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return ""
    if isinstance(raw, (int, np.integer)):
        return str(int(raw))
    if isinstance(raw, float) and float(raw).is_integer():
        return str(int(raw))
    return str(raw).strip()


def _ibge_localidades_municipios_url(uf_id: int) -> str:
    """
    URL do JSON de municípios. Defina `IBGE_LOCALIDADES_MUNICIPIOS_URL` no `.env` (ex.: `back/.env`);
    use `{uf_id}` no path ou uma URL fixa (sem placeholder) para uma única UF.
    """
    default = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf_id}/municipios"
    template = os.environ.get("IBGE_LOCALIDADES_MUNICIPIOS_URL", default).strip() or default
    if "{uf_id}" in template:
        return template.format(uf_id=uf_id)
    return template


def fetch_municipio_codigo_para_nome(uf_id: int) -> dict[str, str]:
    """Código IBGE do município (7 dígitos) → nome oficial (API localidades IBGE)."""
    url = _ibge_localidades_municipios_url(uf_id)
    req = Request(url, headers={"Accept-Encoding": "identity"})
    with urlopen(req, timeout=60) as resp:
        raw = resp.read()
    if len(raw) >= 2 and raw[0] == 0x1F and raw[1] == 0x8B:
        raw = gzip.decompress(raw)
    payload = json.loads(raw.decode("utf-8"))
    return {str(item["id"]): str(item["nome"]) for item in payload}


def _municipio_codigo_from_cell(raw: object) -> str | None:
    """Extrai código de município (7 dígitos) quando a célula é só o código ou começa por ele."""
    k = _normalize_geo_key(raw)
    if not k:
        return None
    if k.isdigit() and len(k) == 7:
        return k
    m = re.match(r"^(\d{7})\b", k)
    return m.group(1) if m else None


def substituir_codigos_municipio_por_nome(
    df: pd.DataFrame,
    *,
    uf_id: int,
    uf_nome: str,
    codigo_para_nome: dict[str, str],
) -> pd.DataFrame:
    """
    Substitui códigos IBGE de municípios pelo nome oficial.
    Linha agregada da UF (ex.: '17' para Tocantins) vira o nome da UF.
    """

    def cell_to_nome(v: object) -> str:
        k = _normalize_geo_key(v)
        if not k:
            return ""
        if k.isdigit() and len(k) == 2 and int(k) == uf_id:
            return uf_nome
        cod = _municipio_codigo_from_cell(v)
        if cod is not None and cod in codigo_para_nome:
            return codigo_para_nome[cod]
        return clean_municipio_label(v)

    out = df.copy()
    out["Município"] = out["Município"].map(cell_to_nome)
    return out


def ibge_text_to_number(series: pd.Series) -> pd.Series:
    """
    Converte células IBGE para float.
    '-', '...', '..', 'X' tratados antes do parse numérico.
    """
    s = series.astype("string")

    def cell_to_scalar(v: object) -> float:
        if v is pd.NA or v is None:
            return np.nan
        t = str(v).strip()
        if t in _ZERO_SYMBOLS:
            return 0.0
        if t in _NULL_SYMBOLS or t == "":
            return np.nan
        # números BR: 1.234,56 → 1234.56
        t_norm = t.replace(".", "").replace(",", ".") if re.search(r",\d{1,2}$", t) else t.replace(",", ".")
        try:
            return float(t_norm)
        except ValueError:
            return np.nan

    return s.map(cell_to_scalar)


# ---------------------------------------------------------------------------
# Leitura + melt
# ---------------------------------------------------------------------------


def read_year_and_product_header(path: Path, sheet_name: str) -> tuple[pd.Series, pd.Series]:
    """
    Linha 4 do Excel = anos (células mescladas → usar ffill).
    Linha 5 = nomes dos produtos / 'Total'.
    Equivale a `header=None, skiprows=3, nrows=2` (linhas 4 e 5 em base 1).
    """
    top = pd.read_excel(path, sheet_name=sheet_name, header=None, skiprows=3, nrows=2, engine="openpyxl")
    year_row = top.iloc[0].ffill()
    prod_row = top.iloc[1]
    return year_row, prod_row


def read_data_skip4(path: Path, sheet_name: str) -> pd.DataFrame:
    """Ignora as primeiras 4 linhas do IBGE; usa a linha 5 como cabeçalho de colunas."""
    return pd.read_excel(path, sheet_name=sheet_name, skiprows=4, header=0, engine="openpyxl")


def wide_to_long(
    df: pd.DataFrame,
    year_row: pd.Series,
    prod_row: pd.Series,
    variavel: str,
) -> pd.DataFrame:
    """
    Converte tabela larga para longo: Ano, Município, Produto_Agrícola, Variavel, Valor.
    """
    if df.empty:
        return pd.DataFrame(columns=["Ano", "Periodo", "Município", "Produto_Agrícola", "Variavel", "Valor"])

    # Alinhar metadados de colunas à largura real do DataFrame (IBGE vs pandas)
    n = min(len(df.columns), len(year_row), len(prod_row))
    yr = year_row.iloc[:n].reset_index(drop=True).ffill()
    pr = prod_row.iloc[:n].reset_index(drop=True)
    df = df.iloc[:, :n]
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    # Primeira coluna = território (Brasil, UF, Município com código, etc.)
    geo_col = df.columns[0]
    value_cols = list(df.columns[1:])

    melted = df.melt(id_vars=[geo_col], value_vars=value_cols, var_name="_prod_header", value_name="valor")

    # Mapear nome de coluna de volta ao índice para recuperar Ano
    col_index = {name: i for i, name in enumerate(df.columns)}
    melted["_col_idx"] = melted["_prod_header"].map(col_index)

    def _parse_year_and_period_from_cell(y: object) -> tuple[float, str | None]:
        if y is None or (isinstance(y, float) and np.isnan(y)):
            return np.nan, None
        ys = str(y).strip()
        if ys.isdigit() and len(ys) == 4:
            return float(ys), None
        ys_norm = (
            ys.casefold()
            .replace("ç", "c")
            .replace("á", "a")
            .replace("à", "a")
            .replace("ã", "a")
            .replace("â", "a")
            .replace("é", "e")
            .replace("ê", "e")
            .replace("í", "i")
            .replace("ó", "o")
            .replace("ô", "o")
            .replace("õ", "o")
            .replace("ú", "u")
        )
        m_month = re.search(r"(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(19\d{2}|20\d{2})", ys_norm)
        if m_month:
            mm = MONTH_NAME_TO_NUM.get(m_month.group(1))
            yy = m_month.group(2)
            if mm:
                return float(yy), f"{yy}-{mm}"
        m2 = re.search(r"(19\d{2}|20\d{2})", ys)
        if m2:
            yy = m2.group(1)
            return float(yy), None
        return np.nan, None

    def year_for_idx(i: int) -> float:
        if i is None or (isinstance(i, float) and np.isnan(i)):
            return np.nan
        cell = yr.iloc[int(i)]
        return _parse_year_and_period_from_cell(cell)[0]

    def period_for_idx(i: int) -> str:
        if i is None or (isinstance(i, float) and np.isnan(i)):
            return ""
        cell = yr.iloc[int(i)]
        _, period = _parse_year_and_period_from_cell(cell)
        return period or ""

    melted["ano"] = melted["_col_idx"].map(year_for_idx)  # coluna temporária
    melted["periodo"] = melted["_col_idx"].map(period_for_idx)

    def product_for_colname(cname: str) -> str:
        i = col_index.get(str(cname).strip())
        if i is None:
            return ""
        p = pr.iloc[i]
        return clean_product_label(p)

    melted["Produto_Agrícola"] = melted["_prod_header"].map(product_for_colname)
    melted["Município"] = melted[geo_col].map(clean_municipio_label)
    melted["Variavel"] = variavel
    melted["Valor"] = ibge_text_to_number(melted["valor"])

    melted.rename(columns={"ano": "Ano"}, inplace=True)
    melted.rename(columns={"periodo": "Periodo"}, inplace=True)
    out = melted[["Ano", "Periodo", "Município", "Produto_Agrícola", "Variavel", "Valor"]].copy()
    return out


def run_etl(
    input_xlsx: Path,
    output_csv: Path,
    *,
    uf_codigo_ibge: int = 17,
    uf_nome: str = "Tocantins",
    por_municipios: bool = False,
    buscar_nomes_api: bool = True,
) -> pd.DataFrame:
    input_xlsx = input_xlsx.resolve()
    output_csv = output_csv.resolve()
    output_csv.parent.mkdir(parents=True, exist_ok=True)

    xl = pd.ExcelFile(input_xlsx, engine="openpyxl")
    sheets = _resolve_sheets(xl)

    parts: list[pd.DataFrame] = []
    for sheet_name, variavel in sheets:
        year_row, prod_row = read_year_and_product_header(input_xlsx, sheet_name)
        wide = read_data_skip4(input_xlsx, sheet_name)
        # Remover linhas de nota/rodapé que por vezes aparecem como texto na coluna A
        wide = wide.dropna(how="all")
        if wide.shape[0] > 0:
            first_geo = wide.columns[0]
            mask_footer = wide[first_geo].astype(str).str.contains("Fonte:", case=False, na=False)
            wide = wide.loc[~mask_footer]
        long_part = wide_to_long(wide, year_row, prod_row, variavel)
        parts.append(long_part)

    result = pd.concat(parts, ignore_index=True)

    if por_municipios and buscar_nomes_api:
        try:
            codigo_para_nome = fetch_municipio_codigo_para_nome(uf_codigo_ibge)
        except (URLError, OSError, json.JSONDecodeError, ValueError) as e:
            raise RuntimeError(
                "Não foi possível obter nomes dos municípios na API do IBGE. "
                "Verifique a conexão ou rode com --sem-nomes-municipios."
            ) from e
        result = substituir_codigos_municipio_por_nome(
            result,
            uf_id=uf_codigo_ibge,
            uf_nome=uf_nome,
            codigo_para_nome=codigo_para_nome,
        )

    if not por_municipios:
        result = aggregate_sidra_long_to_uf_level(
            result,
            default_uf_id=uf_codigo_ibge,
            default_uf_nome=uf_nome,
        )

    # Ordenação estável para diff/reprodutibilidade
    result = result.sort_values(
        ["Variavel", "Município", "Periodo", "Ano", "Produto_Agrícola"],
        ignore_index=True,
    )
    result.to_csv(output_csv, index=False, encoding="utf-8-sig")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="ETL IBGE SIDRA — Tabela 1612 (Excel) → CSV longo.")
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=Path(__file__).resolve().parent / "TCC-IBGE.xlsx",
        help="Caminho para TCC-IBGE.xlsx",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "out" / "ibge_tabela1612_long.csv",
        help="CSV de saída (UTF-8 com BOM).",
    )
    parser.add_argument(
        "--ibge-uf",
        type=int,
        default=17,
        help="Código IBGE da UF para buscar nomes dos municípios (padrão: 17 = Tocantins). Use 0 para desativar.",
    )
    parser.add_argument(
        "--uf-nome",
        type=str,
        default="Tocantins",
        help="Rótulo para a linha agregada da UF (código de 2 dígitos na coluna território).",
    )
    parser.add_argument(
        "--sem-nomes-municipios",
        action="store_true",
        help="Não consulta a API do IBGE; mantém códigos na coluna Município (só com --por-municipio).",
    )
    parser.add_argument(
        "--por-municipio",
        action="store_true",
        help="Saída granular por município (comportamento antigo). Por omissão agrega por UF.",
    )
    args = parser.parse_args()

    uf_codigo = 17 if args.ibge_uf == 0 else int(args.ibge_uf)
    buscar_nomes = args.por_municipio and not args.sem_nomes_municipios
    df = run_etl(
        args.input,
        args.output,
        uf_codigo_ibge=uf_codigo,
        uf_nome=args.uf_nome,
        por_municipios=args.por_municipio,
        buscar_nomes_api=buscar_nomes,
    )
    print(f"Linhas escritas: {len(df)} -> {args.output}")


if __name__ == "__main__":
    main()
