from __future__ import annotations

from pathlib import Path

from integrations.hermes.role_compiler import ROLE_SOURCE_SUBDIR, build_soul_markdown, compile_role_files


def test_build_soul_markdown_excludes_port() -> None:
    soul = build_soul_markdown(
        role_name="写作生文专家",
        role_key="writer",
        role_summary="模板创作、一键生文、内容改写、内容日历",
        source_paths=["marketing/marketing-content-creator.md"],
    )
    assert soul.startswith("# 写作生文专家")
    assert "9601" not in soul
    assert "端口" not in soul
    assert "## 身份" in soul
    assert "负责模板创作" in soul


def test_compile_role_files_nested_agency_agents_zh(tmp_path: Path) -> None:
    source_root = tmp_path / "lib"
    profile_home = tmp_path / "home"
    rel = "marketing/marketing-content-creator.md"
    (source_root / "marketing").mkdir(parents=True)
    (source_root / rel).write_text("# Creator\n", encoding="utf-8")

    compile_role_files(
        profile_name="writer-9601",
        profile_home=profile_home,
        port=9601,
        role_key="writer",
        role_name="写作生文专家",
        role_summary="模板创作",
        source_repo="https://github.com/jnMetaCode/agency-agents-zh",
        source_root=source_root,
        source_paths=[rel],
    )

    copied = profile_home / "skills" / "role-source" / ROLE_SOURCE_SUBDIR / rel
    assert copied.is_file()
    manifest = (profile_home / "profile-role.json").read_text(encoding="utf-8")
    assert f"skills/role-source/{ROLE_SOURCE_SUBDIR}/{rel}" in manifest
