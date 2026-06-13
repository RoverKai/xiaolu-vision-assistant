#!/usr/bin/env python3
"""Scan a frontend repo for design-system signals."""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path


STYLE_EXTENSIONS = {".css", ".scss", ".sass", ".less", ".pcss"}
SOURCE_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte", ".html"}
SKIP_DIRS = {
    ".git",
    ".next",
    ".nuxt",
    ".output",
    "build",
    "coverage",
    "dist",
    "node_modules",
}

COLOR_RE = re.compile(
    r"(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(?:transparent|currentColor)\b)"
)
CSS_VAR_DEF_RE = re.compile(r"(--[a-zA-Z0-9_-]+)\s*:")
CSS_VAR_USE_RE = re.compile(r"var\((--[a-zA-Z0-9_-]+)")
CLASSNAME_RE = re.compile(
    r"className\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|`([^`]+)`)|class\s*=\s*(?:\"([^\"]+)\"|'([^']+)')"
)
IMPORT_RE = re.compile(r"from\s+['\"]([^'\"]+)['\"]|import\s+['\"]([^'\"]+)['\"]")
COMPONENT_FILE_RE = re.compile(r"(^[A-Z][A-Za-z0-9]+|[\\/_][A-Z][A-Za-z0-9]+)\.(tsx|jsx|vue|svelte)$")


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix in STYLE_EXTENSIONS or path.suffix in SOURCE_EXTENSIONS:
            yield path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def trim_counter(counter: collections.Counter[str], limit: int):
    return [{"value": value, "count": count} for value, count in counter.most_common(limit)]


def package_name(import_path: str) -> str:
    if import_path.startswith("@"):
        return "/".join(import_path.split("/")[:2])
    return import_path.split("/")[0]


def audit(root: Path, limit: int):
    colors: collections.Counter[str] = collections.Counter()
    css_var_defs: collections.Counter[str] = collections.Counter()
    css_var_uses: collections.Counter[str] = collections.Counter()
    class_tokens: collections.Counter[str] = collections.Counter()
    imports: collections.Counter[str] = collections.Counter()
    component_files: list[str] = []
    style_files: list[str] = []
    source_files: list[str] = []

    for path in iter_files(root):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)

        if path.suffix in STYLE_EXTENSIONS:
            style_files.append(rel)
        else:
            source_files.append(rel)

        if COMPONENT_FILE_RE.search(path.name) or COMPONENT_FILE_RE.search(rel):
            component_files.append(rel)

        colors.update(match.group(1) for match in COLOR_RE.finditer(text))
        css_var_defs.update(match.group(1) for match in CSS_VAR_DEF_RE.finditer(text))
        css_var_uses.update(match.group(1) for match in CSS_VAR_USE_RE.finditer(text))

        for match in CLASSNAME_RE.finditer(text):
            raw = next(group for group in match.groups() if group)
            tokens = re.split(r"\s+", raw.strip())
            class_tokens.update(token for token in tokens if token and "${" not in token)

        for match in IMPORT_RE.finditer(text):
            value = match.group(1) or match.group(2)
            if value and not value.startswith("."):
                imports.update([package_name(value)])

    likely_libraries = [
        item
        for item in imports
        if item in {"@mui/material", "@chakra-ui/react", "antd", "tailwindcss", "lucide-react", "@radix-ui/react-icons"}
        or item.startswith("@radix-ui/")
    ]

    return {
        "root": root.as_posix(),
        "counts": {
            "style_files": len(style_files),
            "source_files": len(source_files),
            "component_files": len(component_files),
            "colors": len(colors),
            "css_var_defs": len(css_var_defs),
            "css_var_uses": len(css_var_uses),
            "class_tokens": len(class_tokens),
        },
        "files": {
            "style_files": style_files[:limit],
            "component_files": component_files[:limit],
        },
        "signals": {
            "colors": trim_counter(colors, limit),
            "css_var_defs": trim_counter(css_var_defs, limit),
            "css_var_uses": trim_counter(css_var_uses, limit),
            "class_tokens": trim_counter(class_tokens, limit),
            "styling_imports": trim_counter(imports, limit),
            "likely_ui_libraries": sorted(likely_libraries),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository or frontend root to scan.")
    parser.add_argument("--limit", type=int, default=40, help="Maximum entries per report section.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of readable text.")
    args = parser.parse_args()

    report = audit(Path(args.root).resolve(), args.limit)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    print(f"Frontend UI audit: {report['root']}")
    print("Counts:")
    for key, value in report["counts"].items():
        print(f"  {key}: {value}")

    for section, values in report["signals"].items():
        print(f"\n{section}:")
        if isinstance(values, list) and values and isinstance(values[0], dict):
            for item in values:
                print(f"  {item['value']} ({item['count']})")
        elif values:
            for item in values:
                print(f"  {item}")
        else:
            print("  none")

    print("\nstyle_files:")
    for path in report["files"]["style_files"]:
        print(f"  {path}")

    print("\ncomponent_files:")
    for path in report["files"]["component_files"]:
        print(f"  {path}")


if __name__ == "__main__":
    main()
