# Multi-Domain Agentic RAG Assistant — Group 2

Capstone project, IIT Hyderabad (November 2026).
Repository: <https://github.com/suneel130588-art/IITH_MultiDomain_RAG_Agents_Project_Group_2>
· Run it locally: [`HOW_TO_RUN_LOCALLY.md`](HOW_TO_RUN_LOCALLY.md)

A LangGraph multi-agent, hybrid-retrieval question-answering system over five RAGBench domains
(biomedical, legal, finance, customer support, general knowledge). Five agents — Router, Retrieval,
Domain Check, Answer and Safety — produce evidence-grounded answers with citations.

**Final version v2.9:** 25/30 correct (83%) on the 30-question benchmark, 100% routing accuracy.

## Contents

| Folder | File | What it is |
|---|---|---|
| `notebooks/` | `MultiDomain_RAG_Agents_v2.0.ipynb` … `v2.8.ipynb` | Each development version of the Colab notebook |
| `notebooks/` | `MultiDomain_RAG_Agents_v2.9_final.ipynb` | Final submitted version |
| `docs/` | `MultiDomain_RAG_Agents_Project_Presentation.pptx` | Project presentation |
| `docs/` | `MultiDomain_RAG_Agents_Project_Report.pdf` | Project report |
| `docs/` | `Test_Report.docx` / `Test_Report.pdf` | Test report: test plan, T1–T8 results (incl. web-app and GitHub deployment tests), defect log |
| `docs/` | `RAG_30Q_Test_Report.xlsx` | Final 30-question test: v2.9 results, 18 in-dataset questions, version matrix, failure causes, web-app and deployment checks |
| `docs/` | `Retrieval_Parameter_Study.xlsx` | Retrieval experiment: chunking, embedding models, search methods, top-k, legal scope, final choices |
| `docs/` | `RAG_Test_Report_v2.0_to_v2.9.xlsx` | Version-wise test report: questions, answers, accuracy and failure reasons |
| `docs/` | `App_30Q_Check_Result.xlsx` | The 30 test questions run through the web application |
| `docs/` | `RAGBench_Indexed_Data_5_Domains.xlsx` | The indexed RAGBench rows (200 per domain) with questions and reference answers |
| `docs/` | `How_to_Run_Locally.pdf` | PDF copy of the local setup guide |
| `web_app/` | `web_app.py`, `MultiDomainAgent.py`, `static/` | Local browser front end that runs the v2.9 notebook's pipeline (see `web_app/README.md`) |
| (root) | `HOW_TO_RUN_LOCALLY.md` | Step-by-step guide to run the web application on your own PC |

## Running the web application locally

See [`HOW_TO_RUN_LOCALLY.md`](HOW_TO_RUN_LOCALLY.md): install Python 3.12, install `web_app/requirements.txt`,
put your own Groq key in `web_app/.env`, then run `web_app.py` and open `http://127.0.0.1:8001`.

## Running the notebook

Open `notebooks/MultiDomain_RAG_Agents_v2.9_final.ipynb` in Google Colab and add a Groq API key as
the Colab secret `GROQ_API_KEY`. No key is stored in this repository.

## Stack

LangGraph · Groq `openai/gpt-oss-20b` · `all-MiniLM-L6-v2` embeddings · Chroma + BM25 with
reciprocal rank fusion · OpenFDA drug labels · RAGBench dataset (`galileo-ai/ragbench`)
