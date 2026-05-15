"""
Generate a table schema JSON snippet from a CSV or Excel file.
Output is ready to paste into a queries.json "tables" entry.

Usage:
    python make_schema.py datasets/raw/myfile.csv
    python make_schema.py datasets/raw/myfile.xlsx --sheet "Sheet1"
    python make_schema.py datasets/raw/myfile.xlsx --all-sheets

    # Process every file in datasets/raw/ and write to schemas/
    python make_schema.py --all-raw
"""

import argparse
import json
from pathlib import Path

import pandas as pd

# All Functions taken from backend, make sure it's updated. TODO: Refactor to share code between this script and the upload route.


def infer_schema(df: pd.DataFrame) -> dict:
    """Mirrors _infer_schema in backend/app/routes/upload.py."""
    schema = {}
    for col in df.columns:
        dtype = str(df[col].dtype)
        if dtype.startswith("int"):
            col_dtype = "integer"
        elif dtype.startswith("float"):
            col_dtype = "float"
        elif dtype == "bool":
            col_dtype = "boolean"
        else:
            col_dtype = "string"

        sample_values = [
            v.isoformat() if hasattr(v, "isoformat") else v
            for v in df[col].dropna().unique()[:5].tolist()
        ]
        schema[col] = {
            "dtype": col_dtype,
            "sample_values": sample_values,
            "nullability": bool(df[col].isnull().any()),
            "primary_key": bool(df[col].is_unique and not df[col].isnull().any()),
            "description": "",
        }
    return schema


def load_sheets(
    file_path: Path, sheet: str | None, all_sheets: bool
) -> list[tuple[str | None, pd.DataFrame]]:
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        return [(None, pd.read_csv(file_path))]
    if suffix in {".xlsx", ".xls"}:
        xls = pd.ExcelFile(file_path)
        if all_sheets:
            return [(s, xls.parse(s)) for s in xls.sheet_names]
        target = sheet or xls.sheet_names[0]
        return [(target, xls.parse(target))]
    raise ValueError(f"Unsupported file type: {suffix}")


def make_table_name(file_path: Path, sheet: str | None) -> str:
    base = file_path.stem.lower()
    base = "".join(c if c.isalnum() else "_" for c in base).strip("_")
    if sheet:
        sheet_clean = "".join(c if c.isalnum() else "_" for c in sheet.lower()).strip(
            "_"
        )
        return f"{base}_{sheet_clean}"
    return base


EVALS_DIR = Path(__file__).parent
RAW_DIR = EVALS_DIR / "datasets" / "raw"
SCHEMAS_DIR = EVALS_DIR / "datasets" / "schemas"
SUPPORTED = {".csv", ".xlsx", ".xls"}


def make_schemas_for_all_raw() -> None:
    """Process every file in datasets/raw/ and write one schema JSON per file to schemas/."""
    SCHEMAS_DIR.mkdir(exist_ok=True)
    files = [f for f in RAW_DIR.iterdir() if f.suffix.lower() in SUPPORTED]
    if not files:
        print(f"No supported files found in {RAW_DIR}")
        return

    for file_path in sorted(files):
        try:
            sheets = load_sheets(file_path, sheet=None, all_sheets=True)
            tables = [
                {
                    "name": make_table_name(file_path, sheet),
                    "file": str(file_path.relative_to(EVALS_DIR)).replace("\\", "/"),
                    "sheet": sheet,
                    "schema": infer_schema(df),
                }
                for sheet, df in sheets
            ]
            out_path = SCHEMAS_DIR / f"{file_path.stem}.json"
            out_path.write_text(json.dumps(tables, indent=2, default=str))
            print(
                f"  {file_path.name} -> schemas/{out_path.name}  ({len(tables)} table(s))"
            )
        except Exception as e:
            print(f"  {file_path.name} -> ERROR: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate schema JSON for eval queries"
    )
    parser.add_argument("file", type=Path, nargs="?", help="Single CSV or Excel file")
    parser.add_argument("--sheet", default=None, help="Sheet name (Excel only)")
    parser.add_argument("--all-sheets", action="store_true", help="Process all sheets")
    parser.add_argument(
        "--all-raw",
        action="store_true",
        help="Process all files in datasets/raw/ -> schemas/",
    )
    args = parser.parse_args()

    if args.all_raw:
        make_schemas_for_all_raw()
        return

    if not args.file:
        parser.print_help()
        return

    if not args.file.exists():
        print(f"File not found: {args.file}")
        return

    sheets = load_sheets(args.file, args.sheet, args.all_sheets)
    tables = [
        {
            "name": make_table_name(args.file, sheet),
            "file": str(args.file).replace("\\", "/"),
            "sheet": sheet,
            "schema": infer_schema(df),
        }
        for sheet, df in sheets
    ]
    print(json.dumps(tables, indent=2, default=str))


if __name__ == "__main__":
    main()
