"""Independently inspect the synthetic XLSX artifacts using Python's stdlib."""

import json
from pathlib import Path
import re
import sys
from time import perf_counter
import xml.etree.ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "microsoft-proof"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAIN = "{" + NS["m"] + "}"


def require(condition, description):
    if not condition:
        raise AssertionError(description)


def read_rows(archive, sheet_number, strings):
    root = ET.fromstring(archive.read(f"xl/worksheets/sheet{sheet_number}.xml"))
    require(not root.findall(".//m:f", NS), f"Fórmula en hoja {sheet_number}")
    rows = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        cells = {}
        for cell in row.findall("m:c", NS):
            value = cell.find("m:v", NS)
            if value is None:
                continue
            column = re.match(r"[A-Z]+", cell.get("r")).group()
            raw = value.text
            cells[column] = strings[int(raw)] if cell.get("t") == "s" else (
                float(raw) if "." in raw else int(raw)
            )
        rows.append(cells)
    return rows


def inspect(path):
    with ZipFile(path) as archive:
        require(archive.testzip() is None, f"ZIP dañado: {path.name}")
        strings = []
        for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS):
            strings.append("".join(text.text or "" for text in item.findall(".//m:t", NS)))
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        names = [sheet.get("name") for sheet in workbook.findall("m:sheets/m:sheet", NS)]
        sheets = {name: read_rows(archive, index, strings) for index, name in enumerate(names, 1)}
        tables = {}
        for name in archive.namelist():
            if not re.fullmatch(r"xl/tables/table\d+\.xml", name):
                continue
            table = ET.fromstring(archive.read(name))
            tables[table.get("name")] = [column.get("name") for column in
                table.findall("m:tableColumns/m:tableColumn", NS)]
        return sheets, tables


def main():
    started = perf_counter()
    sheets, tables = inspect(OUTPUT / "vera-portafolio-sintetico.xlsx")
    expected = {
        "VERA_Audits": "BI_Audits", "VERA_Risks": "BI_Risks",
        "VERA_Controls": "BI_Controls", "VERA_Findings": "BI_Findings",
        "VERA_Evidence": "BI_Evidence",
    }
    require(set(tables) == set(expected), "Faltan tablas Power BI o hay tablas inesperadas")
    audit = sheets["BI_Audits"]
    require(len(audit) == 2, "Debe haber exactamente una auditoría filtrada")
    audit_id = audit[1]["A"]
    require(audit[0]["A"] == "audit_id", "La clave de auditoría no coincide")
    require(audit[1]["N"] == 40 and audit[1]["O"] == 12.5, "Las horas no coinciden")
    counts = {}
    for table, sheet in expected.items():
        rows = sheets[sheet]
        require([rows[0].get(chr(65 + i)) for i in range(len(tables[table]))] == tables[table],
                f"Cabeceras distintas en {table}")
        counts[table] = len(rows) - 1
        if sheet != "BI_Audits":
            require(all(row["A"] == audit_id for row in rows[1:]),
                    f"Relación audit_id inválida en {table}")
    require(counts == {"VERA_Audits": 1, "VERA_Risks": 1, "VERA_Controls": 1,
                       "VERA_Findings": 1, "VERA_Evidence": 0}, "Conteos inesperados")
    require(sheets["Resumen"][3]["B"] == 1, "Resumen y tabla de auditorías difieren")
    imported, _ = inspect(OUTPUT / "vera-catalogo-sintetico.xlsx")
    require(len(imported["Catalogo"]) == 2, "La plantilla no contiene la fila sintética")
    require(imported["Catalogo"][1]["A"] == "PROCESS", "Tipo de fila importada incorrecto")
    result = {"status": "PASS", "reader": "Python stdlib / OOXML independiente de ExcelJS",
              "tables": counts, "relationships": "audit_id validado", "formulas": 0,
              "importRows": 1, "durationMs": round((perf_counter() - started) * 1000)}
    (OUTPUT / "workbook-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                                                   encoding="utf-8")
    (OUTPUT / "workbook-check.md").write_text(
        "\n## Verificación independiente del archivo\n\n"
        "✓ Dos libros XLSX legibles; cinco tablas para Power BI; relaciones y horas correctas; "
        f"una fila de importación; sin fórmulas. Lectura OOXML con Python, independiente de ExcelJS. "
        f"Tiempo: {result['durationMs']} ms.\n",
        encoding="utf-8")
    print("PASS XLSX independiente: cinco tablas, relaciones, horas, importacion y formulas")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL Verificacion XLSX: {error}", file=sys.stderr)
        raise SystemExit(1) from error
