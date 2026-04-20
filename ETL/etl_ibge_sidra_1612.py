"""
ETL — Tabela 1612 (SIDRA / IBGE) — Produção agrícola municipal (lavouras temporárias).

Extrai as folhas principais do Excel exportado pelo IBGE, normaliza símbolos oficiais,
converte valores numéricos e devolve um conjunto *tidy* (formato longo).

Requisitos: ver `requirements.txt` na mesma pasta.
"""

from __future__ import annotations

import argparse
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

SHEET_FILTERS = [
    # (rótulo da coluna Variavel — minúsculas padronizadas, predicado sobre o nome da folha)
    ("area plantada (hectares)", lambda n: _sheet_match(n, "área plantada", "hectares")),
    ("area colhida (hectares)", lambda n: _sheet_match(n, "área colhida", "hectares")),
    (
        "quantidade produzida (toneladas)",
        lambda n: _sheet_main_var_no_percent(n, "quantidade produzida"),
    ),
    (
        "rendimento medio da producao (quilogramas por hectare)",
        lambda n: _sheet_main_var_no_percent(n, "rendimento médio"),
    ),
    ("valor da producao (mil reais)", lambda n: _sheet_match(n, "valor da produção", "mil reais")),
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
    """Devolve lista (nome_folha_excel, variavel_normalizada)."""
    out: list[tuple[str, str]] = []
    for variavel_label, pred in SHEET_FILTERS:
        hit = next((s for s in xl.sheet_names if pred(s)), None)
        if hit is None:
            raise ValueError(
                f"Não foi encontrada folha compatível com variável '{variavel_label}'. "
                f"Folhas disponíveis: {xl.sheet_names}"
            )
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
        return pd.DataFrame(columns=["Ano", "Município", "Produto_Agrícola", "Variavel", "Valor"])

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

    def year_for_idx(i: int) -> float:
        if i is None or (isinstance(i, float) and np.isnan(i)):
            return np.nan
        y = yr.iloc[int(i)]
        if pd.isna(y):
            return np.nan
        ys = str(y).strip()
        if ys.isdigit() and len(ys) == 4:
            return float(ys)
        return np.nan

    melted["ano"] = melted["_col_idx"].map(year_for_idx)  # coluna temporária

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
    out = melted[["Ano", "Município", "Produto_Agrícola", "Variavel", "Valor"]].copy()
    return out


def run_etl(
    input_xlsx: Path,
    output_csv: Path,
    *,
    ibge_uf: int | None = 17,
    uf_nome: str = "Tocantins",
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

    if ibge_uf is not None:
        try:
            codigo_para_nome = fetch_municipio_codigo_para_nome(ibge_uf)
        except (URLError, OSError, json.JSONDecodeError, ValueError) as e:
            raise RuntimeError(
                "Não foi possível obter nomes dos municípios na API do IBGE. "
                "Verifique a conexão ou rode com --sem-nomes-municipios."
            ) from e
        result = substituir_codigos_municipio_por_nome(
            result,
            uf_id=ibge_uf,
            uf_nome=uf_nome,
            codigo_para_nome=codigo_para_nome,
        )

    # Ordenação estável para diff/reprodutibilidade
    result = result.sort_values(
        ["Variavel", "Município", "Ano", "Produto_Agrícola"],
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
        help="Não consulta a API do IBGE; mantém códigos na coluna Município.",
    )
    args = parser.parse_args()

    ibge_uf = None if args.sem_nomes_municipios or args.ibge_uf == 0 else args.ibge_uf
    df = run_etl(args.input, args.output, ibge_uf=ibge_uf, uf_nome=args.uf_nome)
    print(f"Linhas escritas: {len(df)} -> {args.output}")


if __name__ == "__main__":
    main()
