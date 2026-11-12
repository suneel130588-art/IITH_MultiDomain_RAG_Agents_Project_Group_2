"""Load the final v2.9 multi-domain pipeline straight from the Colab notebook, so the web app runs
exactly the notebook code: 5 RAGBench domains, 200 rows each, 5 agents
(router -> retrieval -> domain_check -> answer -> safety)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_NOTEBOOK = PROJECT_DIR.parent / "notebooks" / "MultiDomain_RAG_Agents_v2.9_final.ipynb"

# Notebook cells the web app does not need: package installs, the demo questions and the Gradio UI.
_SKIP_PREFIXES = ("!pip", "result = ask(")


def build_assistant(notebook: Path = DEFAULT_NOTEBOOK, persist_dir: str | None = None) -> tuple[Any, dict[str, Any]]:
    """Run the notebook's code cells and return (compiled LangGraph app, notebook namespace)."""
    from dotenv import load_dotenv

    load_dotenv(dotenv_path=PROJECT_DIR / ".env")
    if not os.getenv("GROQ_API_KEY"):
        raise RuntimeError("GROQ_API_KEY is not set. Add it to the project .env file or environment.")

    cells = json.loads(Path(notebook).read_text(encoding="utf-8"))["cells"]
    namespace: dict[str, Any] = {}
    persist_set = False
    for index, cell in enumerate(cells):
        source = "".join(cell["source"])
        if cell["cell_type"] != "code" or source.lstrip().startswith(_SKIP_PREFIXES) or "import gradio" in source:
            continue
        # dont_inherit: run the cells exactly as Colab does, without this module's __future__ annotations.
        exec(compile(source, f"{Path(notebook).name}:cell-{index}", "exec", dont_inherit=True), namespace)
        if "PERSIST_DIR" in namespace and not persist_set:
            # Reuse a saved Chroma index instead of re-embedding ~14,700 chunks on every start.
            namespace["PERSIST_DIR"], persist_set = persist_dir, True
    return namespace["assistant"], namespace
