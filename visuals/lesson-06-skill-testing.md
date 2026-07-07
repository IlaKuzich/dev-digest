# Lesson 06 — Skill Testing Approaches

---

## 1. Підходи до тестування скілів — огляд

```mermaid
mindmap
  root((Skill Testing))
    Example-based
      POSITIVE case
        Input with bug / bad code
        Expected finding
      NEGATIVE case
        Input with clean code
        Expected empty array
    Property-based
      Presence check
        dimension є у POSITIVE ✅
      Constraint check
        score ∈ 1-5 ❌ not supported
        reason not empty ❌ not supported
    Adversarial
      Misleading PR title
        chore: safe cleanup
        but code has breaking change
      Prompt injection
        IGNORE PREVIOUS INSTRUCTIONS
        expected output stays empty
    LLM-as-judge
      Judge model evaluates answer
      ❌ not via modal
      Needs separate infra
    Regression snapshots
      Compare with previous run
      ❌ not via modal
      Needs CI script
```

---

## 2. Що доступно через модалку

```mermaid
quadrantChart
    title Підходи тестування: складність vs доступність через модалку
    x-axis Легко писати --> Складно писати
    y-axis Недоступно в модалці --> Доступно в модалці
    quadrant-1 Пишемо першим
    quadrant-2 Потребує зусиль
    quadrant-3 Потребує інфраструктури
    quadrant-4 Пишемо після базових
    Example-based NEGATIVE: [0.15, 0.85]
    Example-based POSITIVE: [0.35, 0.75]
    Adversarial injection: [0.45, 0.65]
    Adversarial misleading title: [0.40, 0.70]
    Property-based presence: [0.50, 0.55]
    Property-based constraints: [0.60, 0.20]
    LLM-as-judge: [0.75, 0.10]
    Regression snapshots: [0.70, 0.15]
```

---

## 3. Як scoring визначає pass/fail

```mermaid
flowchart TD
    RUN["Run case"] --> TYPE{Skill type?}

    TYPE -->|rubric| R1["1 LLM call\n— no diff —\ntitle + body only"]
    TYPE -->|convention / security / custom| F1["2 LLM calls\nWITH skill\nWITHOUT skill"]

    R1 --> R2["scoreRubricCase\nexpected vs actual\nby dimension name"]
    F1 --> F2["scoreCase x2\nrangesOverlap\nfile + lines"]

    R2 --> R3["computePass\ncaseType + score"]
    F2 --> F3["computeSkillPass\nwithPasses AND NOT withoutPasses"]

    R3 --> RESULT{Pass?}
    F3 --> RESULT

    RESULT -->|✅ YES| GREEN["Last run passed\n1/1 passed"]
    RESULT -->|❌ NO| RED["Last run failed\n0/1 passed"]

    classDef rubric fill:#7c3aed,stroke:#5b21b6,color:#fff
    classDef finding fill:#2563eb,stroke:#1d4ed8,color:#fff
    classDef result fill:#059669,stroke:#047857,color:#fff
    classDef fail fill:#dc2626,stroke:#b91c1c,color:#fff

    class R1,R2,R3 rubric
    class F1,F2,F3 finding
    class GREEN result
    class RED fail
```

---

## 4. POSITIVE кейс: чому base model важлива

```mermaid
flowchart LR
    subgraph POSITIVE ["POSITIVE case — must_find"]
        E["expected: [{finding}]"]
    end

    subgraph WITH ["WITH skill"]
        W1["findings: [{finding}]"]
        W2["precision=1, recall=1"]
        W3["withPasses = true ✅"]
    end

    subgraph WITHOUT ["WITHOUT skill"]
        WO1["findings: []"]
        WO2["precision=1, recall=0"]
        WO3["withoutPasses = false ✅"]
    end

    subgraph RESULT2 ["Result"]
        PASS["pass = true AND NOT false\n= TRUE ✅"]
    end

    subgraph FAIL_CASE ["❌ Якщо base model теж знаходить"]
        WO4["without findings: [{finding}]"]
        WO5["withoutPasses = true"]
        FAIL2["pass = true AND NOT true\n= FALSE ❌\nСкіл не додає цінності"]
    end

    E --> W1
    W1 --> W2 --> W3
    E --> WO1
    WO1 --> WO2 --> WO3
    W3 & WO3 --> PASS

    style PASS fill:#059669,color:#fff
    style FAIL2 fill:#dc2626,color:#fff
    style FAIL_CASE fill:#fef2f2,stroke:#fca5a5
```

---

## 5. Рецепт хорошого POSITIVE кейсу для convention/security скілів

```mermaid
flowchart TD
    Q1{"Base model\nзнаходить без скілу?"}
    Q1 -->|YES| BAD["❌ Поганий кейс\nbase model вже знає"]
    Q1 -->|NO| Q2{"Скіл\nзнаходить зі скілом?"}
    Q2 -->|NO| WEAK["❌ Слабкий скіл\nне допомагає"]
    Q2 -->|YES| GOOD["✅ Хороший кейс!\nСкіл додає цінність"]

    BAD --> FIX["Зробити input тонкішим:\n— misleading PR title\n— зміна виглядає як 'покращення'\n— потрібен domain knowledge"]

    style GOOD fill:#059669,color:#fff
    style BAD fill:#dc2626,color:#fff
    style WEAK fill:#d97706,color:#fff
```
