#!/usr/bin/env python3
"""Clean and normalize model output for contact_to_order.

Usage:
  python clean_contact_to_order_json.py raw_model_output.txt
  cat raw_model_output.txt | python clean_contact_to_order_json.py
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any

NULL_LIKE = {"", "null", "none", "n/a", "na", "无", "空", "-", "—", "/"}

LINE_FIELDS = (
    "custname",
    "orderno",
    "supname",
    "deliverydate",
    "partno",
    "partdesc",
    "quantity",
    "price",
    "amount",
)

# LLM / broken JSON repair sometimes emits keys like partdesc%text (":\" corrupted).
FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "custname": ("custname", "customer", "buyer", "采购公司", "客户名称"),
    "orderno": ("orderno", "order_no", "po", "pono", "合同号", "订单号"),
    "supname": ("supname", "supplier", "vendor", "供货公司", "供应商"),
    "deliverydate": ("deliverydate", "delivery_date", "交期", "交货日期"),
    "partno": ("partno", "part_no", "material", "料号", "物料编码"),
    "partdesc": (
        "partdesc",
        "partdesc%text",
        "partdesc_text",
        "partdesctext",
        "description",
        "desc",
        "规格",
        "物料描述",
    ),
    "quantity": ("quantity", "qty", "数量"),
    "price": ("price", "unitprice", "unit_price", "单价"),
    "amount": ("amount", "total", "lineamount", "金额", "小计"),
}


def _read_input() -> str:
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        return Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
    return sys.stdin.read()


def strip_to_json(text: str) -> str:
    text = re.sub(r"<think[^>]*>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = text.replace("```", "")
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return text.strip()


def _quote_unquoted_keys(text: str) -> str:
    return re.sub(r'([\{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', text)


def parse_jsonish(text: str) -> Any:
    cleaned = strip_to_json(text)
    attempts = [cleaned, _quote_unquoted_keys(cleaned), _quote_unquoted_keys(cleaned).replace("'", '"')]
    last_error: Exception | None = None
    for candidate in attempts:
        try:
            return json.loads(candidate)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise SystemExit(json.dumps({"error": "invalid_json", "message": str(last_error), "raw": cleaned[:1000]}, ensure_ascii=False))


def blank_to_none(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        if s.lower() in NULL_LIKE:
            return None
        return s
    return value


def fix_utf8_mojibake(value: str | None) -> str | None:
    """Repair common UTF-8-as-latin1 mojibake in Chinese company names."""
    if not value:
        return value
    try:
        repaired = value.encode("latin1").decode("utf-8")
        if repaired and repaired != value:
            return repaired
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass
    return value


def _canonical_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def row_get_field(row: dict[str, Any], field: str) -> Any:
    if field in row:
        return row[field]
    for alias in FIELD_ALIASES.get(field, (field,)):
        if alias in row:
            return row[alias]
    target = _canonical_key(field)
    for key, value in row.items():
        ck = _canonical_key(key)
        if ck == target or (field == "partdesc" and ck.startswith("partdesc")):
            return value
    return None


def normalize_date(value: Any) -> str | None:
    value = blank_to_none(value)
    if value is None:
        return None
    s = str(value).strip()
    s = s.replace("年", "-").replace("月", "-").replace("日", "")
    s = s.replace("/", "-").replace(".", "-")
    s = re.sub(r"\s+", "", s)
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    for pattern in ["%Y-%m-%d", "%y-%m-%d"]:
        try:
            return datetime.strptime(s, pattern).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def normalize_partno(value: Any) -> str | None:
    value = blank_to_none(value)
    if value is None:
        return None
    s = str(value)
    s = re.sub(r"[\s\u3000]+", "", s)
    return s or None


def normalize_quantity(value: Any) -> int | None:
    value = blank_to_none(value)
    if value is None:
        return None
    if isinstance(value, int):
        return value
    s = str(value).replace(",", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        return int(Decimal(m.group(0)))
    except Exception:  # noqa: BLE001
        return None


def normalize_money(value: Any, *, divide_by_1000: bool = False) -> str | None:
    value = blank_to_none(value)
    if value is None:
        return None
    s = str(value).strip().replace(",", "")
    s = re.sub(r"(?i)(rmb|cny|usd|eur|hkd|jpy|pcs|pc|ea|元|人民币|美元|单价|金额|含税|未税|/)", " ", s)
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        num = Decimal(m.group(0))
        if divide_by_1000:
            num = num / Decimal("1000")
        num = num.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
        return f"{num:.6f}"
    except (InvalidOperation, ValueError):
        return None


def compute_amount(quantity: int | None, price: str | None) -> str | None:
    if quantity is None or price is None:
        return None
    try:
        total = (Decimal(quantity) * Decimal(price)).quantize(
            Decimal("0.000001"), rounding=ROUND_HALF_UP
        )
        return f"{total:.6f}"
    except (InvalidOperation, ValueError):
        return None


def normalize_line(
    row: dict[str, Any],
    *,
    header: dict[str, Any],
    divide_price: bool,
) -> dict[str, Any]:
    custname = blank_to_none(row_get_field(row, "custname")) or blank_to_none(
        row_get_field(header, "custname")
    )
    custname = fix_utf8_mojibake(custname) if custname else custname
    orderno = blank_to_none(row_get_field(row, "orderno")) or blank_to_none(
        row_get_field(header, "orderno")
    )
    supname = blank_to_none(row_get_field(row, "supname")) or blank_to_none(
        row_get_field(header, "supname")
    )
    supname = fix_utf8_mojibake(supname) if supname else supname
    row_divide = divide_price

    quantity = normalize_quantity(row_get_field(row, "quantity"))
    price = normalize_money(row_get_field(row, "price"), divide_by_1000=row_divide)
    amount = normalize_money(row_get_field(row, "amount"), divide_by_1000=False)
    if amount is None:
        amount = compute_amount(quantity, price)

    return {
        "custname": custname,
        "orderno": orderno,
        "supname": supname,
        "deliverydate": normalize_date(row_get_field(row, "deliverydate")),
        "partno": normalize_partno(row_get_field(row, "partno")),
        "partdesc": blank_to_none(row_get_field(row, "partdesc")),
        "quantity": quantity,
        "price": price,
        "amount": amount,
    }


def _expand_legacy_orderinfo(orderinfo: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert old {custname, orderno, supname, items:[...]} to flat rows."""
    header = {
        "custname": orderinfo.get("custname"),
        "orderno": orderinfo.get("orderno"),
        "supname": orderinfo.get("supname"),
    }
    divide_price = False
    raw_items = orderinfo.get("items")
    if isinstance(raw_items, dict):
        raw_items = [raw_items]
    if not isinstance(raw_items, list):
        raw_items = []
    lines: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        merged = {**header, **item}
        lines.append(normalize_line(merged, header=header, divide_price=divide_price))
    return lines


def _coerce_orderinfo_list(orderinfo: Any) -> list[dict[str, Any]]:
    if isinstance(orderinfo, list):
        return [x for x in orderinfo if isinstance(x, dict)]
    if isinstance(orderinfo, dict):
        if "items" in orderinfo:
            return _expand_legacy_orderinfo(orderinfo)
        return [orderinfo]
    return []


def normalize_order(obj: Any) -> dict[str, Any]:
    if not isinstance(obj, dict):
        raise SystemExit(json.dumps({"error": "root_not_object"}, ensure_ascii=False))

    orderinfo_raw = obj.get("orderinfo", obj)
    rows = _coerce_orderinfo_list(orderinfo_raw)

    header: dict[str, Any] = {}
    if isinstance(orderinfo_raw, dict) and "items" not in orderinfo_raw:
        header = {
            "custname": orderinfo_raw.get("custname"),
            "orderno": orderinfo_raw.get("orderno"),
            "supname": orderinfo_raw.get("supname"),
        }

    divide_price = False
    if not divide_price and rows:
        first = rows[0]
        divide_price = False

    normalized: list[dict[str, Any]] = []
    for row in rows:
        normalized.append(normalize_line(row, header=header, divide_price=divide_price))

    return {"orderinfo": normalized}


def main() -> None:
    raw = _read_input()
    obj = parse_jsonish(raw)
    normalized = normalize_order(obj)
    print(json.dumps(normalized, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
