from __future__ import annotations

import hashlib
import json
from pathlib import Path

DELEGATION_LINES: dict[str, list[str]] = {
    "writer": [
        "涉及代码实现时，应委派给智能体专家。",
        "涉及市场数据研究时，应委派给数据研究专家。",
        "涉及财务测算时，应委派给财经专家。",
        "涉及客户拓展时，应委派给销售专家。",
    ],
    "engineer": [
        "涉及写作生文时，应委派给写作生文专家。",
        "涉及市场数据研究时，应委派给数据研究专家。",
        "涉及招聘流程时，应委派给招聘专家。",
        "涉及财务测算时，应委派给财经专家。",
    ],
    "research": [
        "涉及写作生文时，应委派给写作生文专家。",
        "涉及代码实现时，应委派给智能体专家。",
        "涉及财务测算时，应委派给财经专家。",
        "涉及客户拓展时，应委派给销售专家。",
    ],
    "hurman": [
        "涉及写作生文时，应委派给写作生文专家。",
        "涉及代码实现时，应委派给智能体专家。",
        "涉及市场数据研究时，应委派给数据研究专家。",
    ],
    "finance": [
        "涉及写作生文时，应委派给写作生文专家。",
        "涉及代码实现时，应委派给智能体专家。",
        "涉及市场数据研究时，应委派给数据研究专家。",
        "涉及客户拓展时，应委派给销售专家。",
    ],
    "sales": [
        "涉及写作生文时，应委派给写作生文专家。",
        "涉及市场数据研究时，应委派给数据研究专家。",
        "涉及财务测算时，应委派给财经专家。",
        "涉及代码实现时，应委派给智能体专家。",
    ],
}

ROLE_SOURCE_SUBDIR = "agency-agents-zh"

DEFAULT_DELIVERABLES: dict[str, list[str]] = {
    "writer": ["内容模板", "生文提示词", "长文大纲", "多平台改写版本", "内容日历"],
    "engineer": ["技术方案", "代码片段", "Skill 包说明", "集成步骤", "测试清单"],
    "research": ["研究报告", "数据摘要", "趋势分析", "投放/搜索词洞察", "机会清单"],
    "hurman": ["JD 模板", "简历筛选标准", "面试流程", "Offer 检查清单", "招聘看板指标"],
    "finance": ["财务模型", "预测表", "差异分析", "KPI 仪表盘说明", "预算建议"],
    "sales": ["客户拓展计划", "QBR 大纲", "干系人图谱", "客户健康报告", "增长行动项"],
}


def hash_sources(source_root: Path, source_paths: list[str]) -> str:
    digest = hashlib.sha256()
    for rel in source_paths:
        full = source_root / rel
        if full.is_file():
            digest.update(rel.encode())
            digest.update(full.read_text(encoding="utf-8", errors="replace").encode())
    return digest.hexdigest()


def build_soul_markdown(
    *,
    role_name: str,
    role_key: str,
    role_summary: str | None,
    source_paths: list[str],
) -> str:
    """SOUL 身份段不含端口号（team_v1.4 约束）。"""
    source_lines = [f"- agency-agents-zh/{p}" for p in source_paths]
    delegation = DELEGATION_LINES.get(role_key, [])
    deliverables = DEFAULT_DELIVERABLES.get(role_key, ["结构化交付物清单"])
    trimmed = (role_summary or "").strip()
    if trimmed:
        summary = (
            trimmed
            if trimmed.startswith("你是")
            else f"你是 Hermes Desktop 中的{role_name}，负责{trimmed.rstrip('。.')}。"
        )
    else:
        summary = f"你是 Hermes Desktop 中的{role_name}。"

    parts = [
        f"# {role_name}",
        "",
        "## 身份",
        summary,
        "",
        "## 角色来源",
        *source_lines,
        "",
        "## 工作边界",
        *[f"- {line}" for line in delegation],
        "",
        "## 默认交付物",
        *[f"- {d}" for d in deliverables],
        "",
    ]
    return "\n".join(parts)


def build_memory_markdown(*, role_name: str, profile_name: str, role_key: str) -> str:
    return "\n".join(
        [
            f"# {role_name} — 记忆",
            "",
            f"Profile: {profile_name}",
            f"Role key: {role_key}",
            "",
            "§",
            "初始记忆：由 Hermes Desktop 专家预设安装生成。",
            "§",
            "",
        ]
    )


# @lat: [[profiles-instances#角色编译]]
def compile_role_files(
    *,
    profile_name: str,
    profile_home: Path,
    port: int,
    role_key: str,
    role_name: str,
    role_summary: str | None,
    source_repo: str,
    source_root: Path,
    source_paths: list[str],
) -> tuple[str, str, str, str]:
    """返回 soul_path, memory_path, manifest_path, checksum。"""
    profile_home.mkdir(parents=True, exist_ok=True)
    role_source_root = profile_home / "skills" / "role-source" / ROLE_SOURCE_SUBDIR

    copied_rel: list[str] = []
    for rel in source_paths:
        src = source_root / rel
        if not src.is_file():
            raise FileNotFoundError(f"Role source file not found: {src}")
        dest = role_source_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(src.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        rel_posix = rel.replace("\\", "/")
        copied_rel.append(f"skills/role-source/{ROLE_SOURCE_SUBDIR}/{rel_posix}")

    checksum = hash_sources(source_root, source_paths)
    soul_path = profile_home / "SOUL.md"
    memory_path = profile_home / "MEMORY.md"
    manifest_path = profile_home / "profile-role.json"

    soul_path.write_text(
        build_soul_markdown(
            role_name=role_name,
            role_key=role_key,
            role_summary=role_summary,
            source_paths=source_paths,
        ),
        encoding="utf-8",
    )
    memory_path.write_text(
        build_memory_markdown(role_name=role_name, profile_name=profile_name, role_key=role_key),
        encoding="utf-8",
    )
    manifest = {
        "profile": profile_name,
        "port": port,
        "roleKey": role_key,
        "roleName": role_name,
        "sourceRepo": source_repo,
        "sourcePaths": source_paths,
        "generatedFiles": ["SOUL.md", "MEMORY.md", *copied_rel],
        "checksum": checksum,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    return (
        str(soul_path),
        str(memory_path),
        str(manifest_path),
        checksum,
    )
