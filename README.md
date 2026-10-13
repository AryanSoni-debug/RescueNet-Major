# RescueNet — AI-Assisted Accident Reporting & Emergency Resource Coordination

RescueNet is an academic major project prototype for reporting road accidents, checking uploaded accident photos, finding suitable hospitals and ambulances, and presenting emergency guidance. It includes separate user/admin experiences and an accident-hotspot view.

> **Important safety notice:** RescueNet is a demonstration/academic project, not a certified emergency-dispatch system. Do not rely on it for real emergency response. Call the appropriate local emergency service in an actual emergency. Photo verification is a risk estimate, not proof that an image is genuine.

## 1. Project Overview

- **Project Title:** RescueNet — AI-Assisted Accident Reporting and Emergency Resource Coordination
- **Technology Stack:** Python, FastAPI, SQLite, HTML, CSS, JavaScript, JSON, Pillow
- **Project Guide/Mentor:** Aarshi Gupta Mam.
- **Project Objective:** To demonstrate how accident reports, image checks, route information, ambulance availability, and hospital resource availability can be brought together to support faster, more informed emergency coordination.

### Team

|         Name     |     ERP     |                 Responsibility                 |
|------------------|-------------|------------------------------------------------|
| Aryan Soni       | 6606785     | Backend and API Developer                      |
| Aditi Singh      | 6605926     | DSA and Emergency Resource Allocation Developer|
| Himesh Rathore   | 6606781     | Database, Testing and Documentation Lead       |
| Jay Kumar Sahu   | 6606643     | Frontend and Map Integration Developer         |
| Yogita Patil     | 6606732     | AI and Image Verification Developerm           |

## 2. Problem Statement

During an accident, reporting information, verifying the submitted evidence, locating nearby emergency resources, and identifying a hospital with the required facilities can be fragmented tasks. RescueNet demonstrates a unified workflow that collects an accident report and location, checks the uploaded image for risk signals, and presents resource-matching information to support a human review and allocation decision.

The project is intended for learning and demonstration. Its sample hotspot information and browser-side report/resource data are not a live, authoritative emergency-services database.

## 3. Features

- User registration and login, with role-separated user and administrator views.
- Accident reporting with an uploaded photo and location selection.
- Accident-photo risk checks for file validity, duplicate/reused images, metadata signals, image characteristics, and available optional AI services.
- Human review path for uncertain photo-verification results.
- Hospital matching against requested medical resources and displayed availability.
- Ambulance and hospital coordination interface, including cancellation before pickup where supported by the application.
- First-aid guidance using curated protocols, with optional model-assisted answers.
- Accident hotspots / danger-zone visualization and summary chart.
- Administrator tools for reviewing reports and managing displayed hospital/resource information.
- Responsive layout for desktop and mobile.
- Basic web-security protections, session handling, password hashing, request checks, and rate limiting.

**Implementation note:** Feature behavior depends on the current configuration and data. Review the limitations below before presenting this as a production-ready system.

## 4. Technology Stack

|            Layer          |                     Technologies                       |
|---------------------------|--------------------------------------------------------|
| Backend/API               | Python, FastAPI, Uvicorn, Pydantic                     |
| Authentication/security   | SQLite-backed account/session storage,                       PBKDF2-SHA256 password hashing, HTTP-only cookies                                    |
| Frontend                  | HTML, CSS, vanilla JavaScript                          |
| Image processing          | Pillow                                                 |
| Data                      | SQLite for authentication/session data; JSON for 
first-aid protocols; browser `localStorage` for some report/resource data                                                                                 |
| Maps/routing              | OpenStreetMap tiles, Nominatim geocoding, OSRM routing endpoints                                                                            |
| Optional AI integrations  | Anthropic API and/or Hugging Face, configured with environment variables                                                                |
| Development tools         | Git, GitHub, VS Code, Python virtual environment       |

## 5. Project Structure

```text
RescueNet/
├── README.md
├── index.html
├── requirements.txt
├── package.json
├── run.ps1
├── run.sh
├── .env.example
├── .gitignore
├── backend/
│   ├── main.py
│   ├── security.py
│   ├── ai_verify.py
│   └── assistant.py
├── css/
│   └── style.css
├── js/
│   ├── core.js
│   ├── app.js
│   ├── engine.js
│   ├── auth.js
│   ├── risk.js
│   ├── views.js
│   ├── pages.js
│   └── ai.js
├── data/
│   └── firstaid.json
├── icons/
│   └── icon.svg
├── docs/
│   └── PROJECT_REPORT_TEMPLATE.md
├── screenshots/
│   └── README.md
├── PPT.pptx
├── manifest.webmanifest
└── sw.js
```

## 6. Installation and Execution

### Prerequisites

- Python 3.10 or later (Python 3.12 is suitable).
- Git, if cloning from GitHub.
- Windows PowerShell for `run.ps1`, or macOS/Linux shell for `run.sh`.

### Clone the repository

```bash
git clone https://github.com/AryanSoni-debug/RescueNet-Major.git
cd RescueNet
```

### Windows (PowerShell)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run.ps1
```

### macOS / Linux

```bash
chmod +x run.sh
./run.sh
```

When the server starts, open **http://127.0.0.1:8000** in your browser. The backend health endpoint is **http://127.0.0.1:8000/api/health**.

### Manual setup (alternative)

```bash
python -m venv .venv
```

Activate the environment:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS/Linux
source .venv/bin/activate
```

Install dependencies and start the server:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### Configuration

1. Copy `.env.example` to `.env`.
2. Review the administrator email configuration before the database is initialized for the first time.
3. Optional AI integrations can be configured with `ANTHROPIC_API_KEY` or `HF_TOKEN`.
4. Never commit `.env`, generated administrator credentials, database files, or API keys.
5. On first startup, follow the console instructions for administrator credentials and store them securely.

API documentation is disabled by default. For local development only, `RESCUENET_DEBUG=1` enables the FastAPI docs endpoint.

## 7. DSA Concepts Used

Only list the concepts actually implemented in the current source code and be prepared to explain them during evaluation.

- **Graph concepts:** road/location network representation, where implemented by the route/allocation logic.
- **Shortest-path / route optimization:** route results are obtained through the configured routing service; describe Dijkstra only if your own source code implements it.
- **Searching and filtering:** matching hospitals/resources against a report's requested facilities.
- **Hashing:** password hashing and image fingerprints/hashes for security and duplicate-photo checks.
- **Priority-based selection / cost comparison:** include a priority queue or min-heap only if the corresponding data structure is actually present in the submitted code.
- **Time and space complexity:** analyze the specific matching, image-checking, and filtering routines you demonstrate.

**Academic accuracy:** Do not claim linked lists, trees, heaps, Dijkstra, or a custom AI model unless you can point to the implementation in this repository. External map/routing APIs and optional hosted AI services should be identified as integrations, not as algorithms written entirely by the project team.

## 8. Learning Outcomes

- Building REST API endpoints with FastAPI.
- Connecting a browser-based frontend to a Python backend.
- Implementing registration, login, sessions, password hashing, and role-based access.
- Validating uploaded image files and extracting image metadata.
- Integrating map, geocoding, routing, and optional AI services.
- Matching reported needs with displayed hospital resources.
- Managing environment variables, dependencies, Git, and GitHub documentation.
- Recognizing the reliability, privacy, security, and validation requirements of emergency-related software.

## 9. Future Scope

- Move all accident reports, hospital resources, ambulance status, allocation decisions, and audit history to server-side persistent storage.
- Integrate verified, maintained hospital and ambulance availability feeds.
- Validate image-verification thresholds against a diverse, consented real-world dataset and report precision/recall.
- Add authenticated, auditable administrator overrides and immutable allocation history.
- Add reliable PDF export for a complete accident report if it is not already included in the final build.
- Add automated tests, deployment monitoring, backups, accessibility checks, and secure production hosting.
- Evaluate routing quality and fallback behavior when external map services are unavailable.

## 10. References

- FastAPI documentation: https://fastapi.tiangolo.com/
- Python documentation: https://docs.python.org/3/
- SQLite documentation: https://www.sqlite.org/docs.html
- Pillow documentation: https://pillow.readthedocs.io/
- OpenStreetMap: https://www.openstreetmap.org/
- Nominatim documentation: https://nominatim.org/release-docs/latest/
- OSRM API documentation: https://project-osrm.org/docs/

## Known Limitations

- Some report, hospital, ambulance, and related application state is stored in browser `localStorage`, not in a centralized server-side database.
- Hotspot history and road-corridor information may contain illustrative sample data and approximate geometry.
- Photo verification is a risk estimate, not proof of authenticity. Optional external model checks require credentials and network access.
- Map geocoding and routing rely on external services and may be rate-limited or unavailable.
- The project has not been certified for real emergency dispatch or clinical use.
