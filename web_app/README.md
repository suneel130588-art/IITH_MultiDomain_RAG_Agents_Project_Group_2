# Web application

A local browser front end for the final v2.9 pipeline. `MultiDomainAgent.py` reads
`../notebooks/MultiDomain_RAG_Agents_v2.9_final.ipynb` and runs its code cells (skipping `!pip`, the demo
questions and Gradio), so the web app uses exactly the notebook's five agents, LangGraph graph and Groq LLM.

| File | Job |
|---|---|
| `web_app.py` | web server: serves the page, answers `POST /api/chat`, optional login |
| `MultiDomainAgent.py` | loads the notebook and returns the compiled LangGraph `assistant` |
| `static/index.html`, `static/app.js`, `static/style.css` | the browser page |
| `run_web_app.bat` | Windows one-click setup and start (creates `.venv`, installs packages, asks for the key, opens the browser) |

## Run

**Windows, one click:** double-click `run_web_app.bat` (full steps in `../HOW_TO_RUN_LOCALLY.md`).

**Manual:**

```powershell
cd web_app
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # then put your own GROQ_API_KEY in .env
.\.venv\Scripts\python web_app.py --host 127.0.0.1 --port 8001
```

Open `http://127.0.0.1:8001`. The first start embeds about 14,700 chunks into `chroma_multidomain/`
(slow on CPU); later starts reuse it.

Optional login: add `APP_USER=iith` and `APP_PASSWORD=…` to `.env` (or set them as environment variables).
Use this before exposing the server through a tunnel, so others cannot spend your Groq quota.
