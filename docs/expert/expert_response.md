
GET /api/v1/hermes/tasks/39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7

{
    "code": 0,
    "error_code": null,
    "message_key": null,
    "message": "success",
    "data": {
        "id": "39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7",
        "org_id": "2be7c618-326d-4a73-91ea-1cfda10f7073",
        "task_no": "TASK-2be7-02dcf445",
        "skill_id": "customer-profiling",
        "tool_name": "hermes_xieyi__customer-profiling",
        "agent_id": "d21c77b1-80f7-4845-a49a-1d8aa26a546e",
        "profile_id": "xieyi",
        "workspace_id": null,
        "installation_id": null,
        "user_id": "55576b5f-5be6-4a20-aca8-5b5526adf18a",
        "status": "completed",
        "arguments": {
            "prompt": "请提供深圳市威特迪实业有限公司客户画像"
        },
        "arguments_hash": "044df0bebcb4017356d387a599ce3b9ee1e8c7ca6db11c9d2e0cc0a4f3b8d1a2",
        "request_summary": null,
        "result_summary": "已完成深圳市威特迪实业有限公司客户画像，报告已本地归档（不推送企微）。\n\n核心结论：\n\n【公司定位】威特迪实业（2021年成立，注册资本210万/实缴100万，法人谢智坤，参保77人）是\"威特迪/WEITDY\"品牌体系（香港威特迪集团→威特迪科技2007→威特迪实业2021）中的制造/经营实体，集研发、生产、销售一体的CCTV安防监控设备制造商，采用华为海思芯片平台，资质含高新技术企业(2023)、A级纳税人(2025)，有38项专利。\n\n【产品线】AI智能警戒摄像机、智能黑光全彩、智能双光、白光/红光摄像机、AI车牌识别、WiFi/4G全网通摄像机、智能NVR、4K监视器。\n\n【客户等级】C级 45/110——基本面偏弱（小微、未融资、注册资本低），但业务与代理品牌匹配度突出（9/10），外围器件切入可行性强。\n\n【切入策略】核心SoC（海思）为原厂直采不可触及，定位\"外围器件国产配套补充层\"。首推 NOR Flash（恒烁）+ PMU（上海贝岭），再沿 DDR（Nanya）→ TVS（应能微）→ WiFi（博流/爱科微）扩展，4G全网通新品可顺带推移远4G模组。对接法人谢智坤（决策",
        "error_code": null,
        "error_message": null,
        "hermes_run_id": null,
        "event_url": "/api/v1/hermes/tasks/39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7/events",
        "artifact_url": "/api/v1/hermes/tasks/39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7/artifacts",
        "started_at": null,
        "completed_at": "2026-08-24T15:26:23.738145Z",
        "created_at": "2026-08-24T15:21:56.443380Z",
        "updated_at": "2026-08-24T15:21:58.252270Z",
        "priority": 0,
        "retry_count": 0,
        "max_retry": 1,
        "queue_reason": null,
        "queue_entered_at": "2026-08-24T15:21:56.457882Z",
        "not_before": null
    }
}


GET /api/v1/hermes/tasks/39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7/artifacts

{
    "code": 0,
    "message": "success",
    "data": [
        {
            "id": "0394267d-857e-4209-a1ac-1ca160e4a288",
            "org_id": "2be7c618-326d-4a73-91ea-1cfda10f7073",
            "task_id": "39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7",
            "skill_id": "customer-profiling",
            "agent_id": "d21c77b1-80f7-4845-a49a-1d8aa26a546e",
            "workspace_id": null,
            "file_name": "report_报告_20260824_1526.md",
            "file_path": "orgs/2be7c618-326d-4a73-91ea-1cfda10f7073/tasks/39ceb910-e7c1-43b2-bfd0-aba5fff0e1a7/artifacts/0394267d-857e-4209-a1ac-1ca160e4a288/report_报告_20260824_1526.md",
            "relative_path": "workspace/drafts/misc/report_报告_20260824_1526.md",
            "content_type": "text/markdown",
            "artifact_type": "markdown",
            "size_bytes": 2189,
            "sha256": "1cd4814ac18b6a6a2d6bdbb90217eeeef21a8501097bf60fe539161bbff664ad",
            "storage_type": "object_store",
            "download_count": 0,
            "permission_scope": "org",
            "preview_supported": true,
            "metadata_json": {
                "source": "materialized",
                "tool_name": "hermes_xieyi__customer-profiling",
                "artifact_mode": "pull_only"
            },
            "source": "materialized",
            "kb_status": "none",
            "created_by": "55576b5f-5be6-4a20-aca8-5b5526adf18a",
            "created_at": "2026-08-24T15:21:58.252270Z",
            "preview_url": "/api/v1/hermes/artifacts/0394267d-857e-4209-a1ac-1ca160e4a288/preview",
            "download_url": "/api/v1/hermes/artifacts/0394267d-857e-4209-a1ac-1ca160e4a288/download"
        }
    ],
    "server_artifacts": [
        {
            "name": "report_报告_20260824_1526.md",
            "type": "markdown",
            "store": "nodeskclaw_artifact_store",
            "stored": true,
            "kb_status": "none",
            "mime_type": "text/markdown",
            "artifact_id": "0394267d-857e-4209-a1ac-1ca160e4a288",
            "preview_url": "/api/v1/hermes/artifacts/0394267d-857e-4209-a1ac-1ca160e4a288/preview",
            "download_url": "/api/v1/hermes/artifacts/0394267d-857e-4209-a1ac-1ca160e4a288/download",
            "workspace_saved": false,
            "suggested_workspace_path": "workspace/drafts/misc/report_报告_20260824_1526.md"
        }
    ],
    "artifact_mode": "pull_only"
}