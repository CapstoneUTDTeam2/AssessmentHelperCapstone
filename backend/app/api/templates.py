from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.cycle_deadlines import campus_now, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["templates"])

# The rating column allows 1 to 6, where 6 is Not Applicable (see ObservationCriterionRating in the DDL).
RATING_SCALE = [
    {"value": 5, "label": "Exemplary"},
    {"value": 4, "label": "Exceeds"},
    {"value": 3, "label": "Meets"},
    {"value": 2, "label": "Developing"},
    {"value": 1, "label": "Needs improvement"},
    {"value": 6, "label": "Not Applicable"},
]
APPLIES_TO = ("All", "In person", "Online / Hybrid")

TEMPLATE_COLUMNS = """
    t.templateid, t.templateversion, t.templatecontent, t.lastupdatedate, t.lastupdatetime,
    t.isactive, t.islocked,
    ARRAY(SELECT ec.CycleID FROM EvaluationCycle ec WHERE ec.TemplateID = t.TemplateID ORDER BY ec.CycleID) AS cycleids,
    (SELECT COUNT(*) FROM Observation o WHERE o.TemplateID = t.TemplateID) AS observationcount
"""
LIST_TEMPLATES_SQL = f"SELECT {TEMPLATE_COLUMNS} FROM ObservationTemplate t ORDER BY t.TemplateID"
TEMPLATE_SQL = f"SELECT {TEMPLATE_COLUMNS} FROM ObservationTemplate t WHERE t.TemplateID = :template_id"

SECTIONS_SQL = """
SELECT sectionid, sectionname, displayorder
FROM EvaluationCriterionSection
WHERE TemplateID = :template_id
ORDER BY DisplayOrder, SectionID
"""
SECTION_SQL = "SELECT sectionid, templateid, sectionname, displayorder FROM EvaluationCriterionSection WHERE SectionID = :section_id"

CRITERIA_SQL = """
SELECT
    ec.criterionid, ec.templateid, ec.criterionname, ec.description, ec.sectionid, ec.displayorder,
    ec.guidance, ec.appliesto, ec.isactive, ec.isrequired, ec.notesonlowrating,
    ARRAY(
        SELECT b.BulletText FROM EvaluationCriterionBullet b
        WHERE b.CriterionID = ec.CriterionID ORDER BY b.BulletOrder
    ) AS bullets,
    (SELECT COUNT(DISTINCT r.ObservationID) FROM ObservationCriterionRating r WHERE r.CriterionID = ec.CriterionID) AS usedin
FROM EvaluationCriterion ec
WHERE ec.TemplateID = :template_id
ORDER BY ec.DisplayOrder, ec.CriterionID
"""
CRITERION_SQL = """
SELECT criterionid, templateid FROM EvaluationCriterion WHERE CriterionID = :criterion_id
"""

LOCK_TEMPLATES_SQL = "LOCK TABLE ObservationTemplate, EvaluationCriterion IN SHARE ROW EXCLUSIVE MODE"
NEXT_TEMPLATE_ID_SQL = "SELECT COALESCE(MAX(TemplateID), 0) + 1 FROM ObservationTemplate"
NEXT_CRITERION_ID_SQL = "SELECT COALESCE(MAX(CriterionID), 0) + 1 FROM EvaluationCriterion"
NEXT_CRITERION_ORDER_SQL = "SELECT COALESCE(MAX(DisplayOrder), 0) + 1 FROM EvaluationCriterion WHERE TemplateID = :template_id"
NEXT_SECTION_ORDER_SQL = "SELECT COALESCE(MAX(DisplayOrder), 0) + 1 FROM EvaluationCriterionSection WHERE TemplateID = :template_id"

INSERT_TEMPLATE_SQL = """
INSERT INTO ObservationTemplate (TemplateID, TemplateVersion, TemplateContent, LastUpdateDate, LastUpdateTime, isActive)
VALUES (:template_id, :version, :content, :d, :t, FALSE)
"""
UPDATE_TEMPLATE_SQL = """
UPDATE ObservationTemplate
SET TemplateVersion = :version, TemplateContent = :content, LastUpdateDate = :d, LastUpdateTime = :t
WHERE TemplateID = :template_id
"""
TOUCH_TEMPLATE_SQL = "UPDATE ObservationTemplate SET LastUpdateDate = :d, LastUpdateTime = :t WHERE TemplateID = :template_id"

INSERT_SECTION_SQL = """
INSERT INTO EvaluationCriterionSection (TemplateID, SectionName, DisplayOrder)
VALUES (:template_id, :name, :display_order)
RETURNING SectionID
"""
UPDATE_SECTION_SQL = "UPDATE EvaluationCriterionSection SET SectionName = :name, DisplayOrder = :display_order WHERE SectionID = :section_id"
DELETE_SECTION_SQL = "DELETE FROM EvaluationCriterionSection WHERE SectionID = :section_id"
SECTION_IN_USE_SQL = "SELECT 1 FROM EvaluationCriterion WHERE SectionID = :section_id LIMIT 1"
SECTION_ORDER_TAKEN_SQL = """
SELECT 1 FROM EvaluationCriterionSection
WHERE TemplateID = :template_id AND DisplayOrder = :display_order AND SectionID <> :section_id
"""

INSERT_CRITERION_SQL = """
INSERT INTO EvaluationCriterion (
    CriterionID, TemplateID, CriterionName, Description, SectionID, DisplayOrder,
    Guidance, AppliesTo, IsActive, IsRequired, NotesOnLowRating
)
VALUES (
    :criterion_id, :template_id, :name, :description, :section_id, :display_order,
    :guidance, :applies_to, :is_active, :is_required, :notes_on_low_rating
)
"""
UPDATE_CRITERION_SQL = """
UPDATE EvaluationCriterion
SET CriterionName = :name, Description = :description, SectionID = :section_id,
    DisplayOrder = :display_order, Guidance = :guidance, AppliesTo = :applies_to,
    IsActive = :is_active, IsRequired = :is_required, NotesOnLowRating = :notes_on_low_rating
WHERE CriterionID = :criterion_id
"""
CRITERION_ROW_SQL = """
SELECT criterionid, templateid, criterionname, description, sectionid, displayorder,
       guidance, appliesto, isactive, isrequired, notesonlowrating
FROM EvaluationCriterion WHERE CriterionID = :criterion_id
"""
DELETE_BULLETS_SQL = "DELETE FROM EvaluationCriterionBullet WHERE CriterionID = :criterion_id"
INSERT_BULLET_SQL = """
INSERT INTO EvaluationCriterionBullet (CriterionID, BulletOrder, BulletText) VALUES (:criterion_id, :n, :bullet)
"""
DELETE_CRITERION_SQL = "DELETE FROM EvaluationCriterion WHERE CriterionID = :criterion_id"
CRITERION_RATED_SQL = "SELECT 1 FROM ObservationCriterionRating WHERE CriterionID = :criterion_id LIMIT 1"

CYCLE_TEMPLATE_SQL = "UPDATE EvaluationCycle SET TemplateID = :template_id WHERE CycleID = :cycle_id"


class TemplateBody(BaseModel):
    version: str
    content: str | None = None


class NewVersionBody(BaseModel):
    version: str
    content: str | None = None


class SectionBody(BaseModel):
    name: str
    display_order: int | None = None


class CriterionBody(BaseModel):
    name: str
    description: str | None = None
    section_id: int | None = None
    display_order: int | None = None
    guidance: str | None = None
    applies_to: str = "All"
    is_active: bool = True
    is_required: bool = True
    notes_on_low_rating: bool = True
    bullets: list[str] = []


class CriterionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    section_id: int | None = None
    display_order: int | None = None
    guidance: str | None = None
    applies_to: str | None = None
    is_active: bool | None = None
    is_required: bool | None = None
    notes_on_low_rating: bool | None = None
    bullets: list[str] | None = None


class CycleTemplateBody(BaseModel):
    template_id: int


def _now():
    now = campus_now().replace(microsecond=0)
    return {"d": now.date(), "t": now.time()}


def _db_error(error):
    original = getattr(error, "orig", None)
    return str(original if original is not None else error).splitlines()[0]


def _template_payload(row):
    updated = None
    if row["lastupdatedate"] is not None:
        updated = (
            datetime.combine(row["lastupdatedate"], row["lastupdatetime"]).isoformat()
            if row["lastupdatetime"] is not None else row["lastupdatedate"].isoformat()
        )
    return {
        "template_id": row["templateid"],
        "version": row["templateversion"],
        "content": row["templatecontent"],
        "is_active": bool(row["isactive"]),
        "is_locked": row["islocked"],
        "last_updated": updated,
        "cycle_ids": list(row["cycleids"] or []),
        "observation_count": row["observationcount"],
    }


def _criterion_payload(row):
    return {
        "criterion_id": row["criterionid"],
        "template_id": row["templateid"],
        "name": row["criterionname"],
        "description": row["description"],
        "section_id": row["sectionid"],
        "display_order": row["displayorder"],
        "guidance": row["guidance"],
        "applies_to": row["appliesto"],
        "is_active": row["isactive"],
        "is_required": row["isrequired"],
        "notes_on_low_rating": row["notesonlowrating"],
        "bullets": list(row["bullets"] or []),
        "used_in": row["usedin"],
    }


def _require_template(conn, template_id):
    row = conn.execute(text(TEMPLATE_SQL), {"template_id": template_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return row


def _require_unlocked(template):
    if template["islocked"]:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Template {template['templateversion']} is locked because a completed observation used it. "
                "Create a new version to make changes."
            ),
        )


def _full_template(conn, template_id):
    template = _require_template(conn, template_id)
    sections = conn.execute(text(SECTIONS_SQL), {"template_id": template_id}).mappings().all()
    criteria = conn.execute(text(CRITERIA_SQL), {"template_id": template_id}).mappings().all()
    return {
        **_template_payload(template),
        "rating_scale": RATING_SCALE,
        "sections": [
            {"section_id": s["sectionid"], "name": s["sectionname"], "display_order": s["displayorder"]}
            for s in sections
        ],
        "criteria": [_criterion_payload(c) for c in criteria],
    }


def _check_section(conn, section_id, template_id):
    if section_id is None:
        return
    section = conn.execute(text(SECTION_SQL), {"section_id": section_id}).mappings().first()
    if section is None or section["templateid"] != template_id:
        raise HTTPException(status_code=400, detail="That section isn't part of this template")


def _check_criterion_fields(name, applies_to):
    if name is not None and not name.strip():
        raise HTTPException(status_code=400, detail="Criterion name can't be empty")
    if name is not None and len(name.strip()) > 100:
        raise HTTPException(status_code=400, detail="Criterion name must be 100 characters or less")
    if applies_to is not None and applies_to not in APPLIES_TO:
        raise HTTPException(status_code=400, detail=f"applies_to must be one of: {', '.join(APPLIES_TO)}")


def _clean_bullets(bullets):
    cleaned = [b.strip() for b in bullets]
    if any(not b for b in cleaned):
        raise HTTPException(status_code=400, detail="Bullet points can't be empty")
    return cleaned


def _write_bullets(conn, criterion_id, bullets):
    conn.execute(text(DELETE_BULLETS_SQL), {"criterion_id": criterion_id})
    for n, bullet in enumerate(bullets, start=1):
        conn.execute(text(INSERT_BULLET_SQL), {"criterion_id": criterion_id, "n": n, "bullet": bullet})


# What: every observation template version.
@router.get("/templates")
def list_templates():
    # Input: none
    # Output: templates with active/locked flags and which cycles use them
    with engine.connect() as conn:
        rows = conn.execute(text(LIST_TEMPLATES_SQL)).mappings().all()
    return {"templates": [_template_payload(r) for r in rows]}


# What: the template a cycle uses, with its sections, criteria, and rating scale.
@router.get("/templates/current")
def get_cycle_template(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: the full template for that cycle
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        template_id = conn.execute(
            text("SELECT TemplateID FROM EvaluationCycle WHERE CycleID = :c"), {"c": cycle["cycleid"]}
        ).scalar()
        if template_id is None:
            raise HTTPException(status_code=404, detail="This cycle has no template yet")
        return {"cycle_id": cycle["cycleid"], **_full_template(conn, template_id)}


# What: one template with its sections, criteria, and rating scale.
@router.get("/templates/{template_id}")
def get_template(template_id: int):
    # Input: template_id
    # Output: the full template
    with engine.connect() as conn:
        return _full_template(conn, template_id)


# What: committee renames or re-describes an unlocked template (AHC-280).
@router.put("/templates/{template_id}")
def update_template(template_id: int, body: TemplateBody):
    # Input: template_id, version, optional content
    # Output: the updated template
    if not body.version.strip():
        raise HTTPException(status_code=400, detail="Version can't be empty")
    try:
        with engine.begin() as conn:
            _require_unlocked(_require_template(conn, template_id))
            conn.execute(
                text(UPDATE_TEMPLATE_SQL),
                {"template_id": template_id, "version": body.version.strip(), "content": body.content, **_now()},
            )
            return _full_template(conn, template_id)
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee starts a new template version by copying an existing one (AHC-280).
#       Old versions are kept, so completed observations keep the form they used.
@router.post("/templates/{template_id}/versions", status_code=201)
def create_template_version(template_id: int, body: NewVersionBody):
    # Input: the template to copy, a version name, optional content
    # Output: the new unlocked template with copied sections, criteria, and bullets
    if not body.version.strip():
        raise HTTPException(status_code=400, detail="Version can't be empty")
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_TEMPLATES_SQL))
            source = _require_template(conn, template_id)
            new_id = conn.execute(text(NEXT_TEMPLATE_ID_SQL)).scalar_one()
            conn.execute(
                text(INSERT_TEMPLATE_SQL),
                {
                    "template_id": new_id,
                    "version": body.version.strip(),
                    "content": body.content if body.content is not None else source["templatecontent"],
                    **_now(),
                },
            )
            section_map = {}
            for section in conn.execute(text(SECTIONS_SQL), {"template_id": template_id}).mappings():
                section_map[section["sectionid"]] = conn.execute(
                    text(INSERT_SECTION_SQL),
                    {"template_id": new_id, "name": section["sectionname"], "display_order": section["displayorder"]},
                ).scalar_one()
            next_criterion = conn.execute(text(NEXT_CRITERION_ID_SQL)).scalar_one()
            for criterion in conn.execute(text(CRITERIA_SQL), {"template_id": template_id}).mappings().all():
                conn.execute(
                    text(INSERT_CRITERION_SQL),
                    {
                        "criterion_id": next_criterion,
                        "template_id": new_id,
                        "name": criterion["criterionname"],
                        "description": criterion["description"],
                        "section_id": section_map.get(criterion["sectionid"]),
                        "display_order": criterion["displayorder"],
                        "guidance": criterion["guidance"],
                        "applies_to": criterion["appliesto"],
                        "is_active": criterion["isactive"],
                        "is_required": criterion["isrequired"],
                        "notes_on_low_rating": criterion["notesonlowrating"],
                    },
                )
                _write_bullets(conn, next_criterion, list(criterion["bullets"] or []))
                next_criterion += 1
            return _full_template(conn, new_id)
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error(error))


# What: committee picks which template a cycle uses.
@router.put("/evaluation-cycles/{cycle_id}/template")
def set_cycle_template(cycle_id: int, body: CycleTemplateBody):
    # Input: cycle_id, template_id
    # Output: the cycle's template (409 once the cycle has observations)
    try:
        with engine.begin() as conn:
            cycle = resolve_cycle(conn, cycle_id)
            _require_template(conn, body.template_id)
            conn.execute(text(CYCLE_TEMPLATE_SQL), {"template_id": body.template_id, "cycle_id": cycle["cycleid"]})
            return {"cycle_id": cycle["cycleid"], **_full_template(conn, body.template_id)}
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee adds a section (group of criteria) to an unlocked template.
@router.post("/templates/{template_id}/sections", status_code=201)
def add_section(template_id: int, body: SectionBody):
    # Input: template_id, name, optional display_order
    # Output: the full template
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Section name can't be empty")
    try:
        with engine.begin() as conn:
            _require_unlocked(_require_template(conn, template_id))
            order = body.display_order
            if order is None:
                order = conn.execute(text(NEXT_SECTION_ORDER_SQL), {"template_id": template_id}).scalar_one()
            elif conn.execute(
                text(SECTION_ORDER_TAKEN_SQL), {"template_id": template_id, "display_order": order, "section_id": -1}
            ).first():
                raise HTTPException(status_code=409, detail=f"Another section already uses position {order}")
            conn.execute(text(INSERT_SECTION_SQL), {"template_id": template_id, "name": body.name.strip(), "display_order": order})
            return _full_template(conn, template_id)
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee renames or moves a section.
@router.put("/sections/{section_id}")
def update_section(section_id: int, body: SectionBody):
    # Input: section_id, name, optional display_order
    # Output: the full template
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Section name can't be empty")
    try:
        with engine.begin() as conn:
            section = conn.execute(text(SECTION_SQL), {"section_id": section_id}).mappings().first()
            if section is None:
                raise HTTPException(status_code=404, detail="Section not found")
            _require_unlocked(_require_template(conn, section["templateid"]))
            order = section["displayorder"] if body.display_order is None else body.display_order
            if conn.execute(
                text(SECTION_ORDER_TAKEN_SQL),
                {"template_id": section["templateid"], "display_order": order, "section_id": section_id},
            ).first():
                raise HTTPException(status_code=409, detail=f"Another section already uses position {order}")
            conn.execute(text(UPDATE_SECTION_SQL), {"section_id": section_id, "name": body.name.strip(), "display_order": order})
            return _full_template(conn, section["templateid"])
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee deletes an empty section.
@router.delete("/sections/{section_id}")
def delete_section(section_id: int):
    # Input: section_id
    # Output: the full template (409 if criteria are still in the section)
    try:
        with engine.begin() as conn:
            section = conn.execute(text(SECTION_SQL), {"section_id": section_id}).mappings().first()
            if section is None:
                raise HTTPException(status_code=404, detail="Section not found")
            _require_unlocked(_require_template(conn, section["templateid"]))
            if conn.execute(text(SECTION_IN_USE_SQL), {"section_id": section_id}).first():
                raise HTTPException(status_code=409, detail="Move or delete the criteria in this section first")
            conn.execute(text(DELETE_SECTION_SQL), {"section_id": section_id})
            return _full_template(conn, section["templateid"])
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee adds a criterion to an unlocked template (AHC-280).
@router.post("/templates/{template_id}/criteria", status_code=201)
def add_criterion(template_id: int, body: CriterionBody):
    # Input: template_id and the criterion fields, including bullet points
    # Output: the new criterion
    _check_criterion_fields(body.name, body.applies_to)
    bullets = _clean_bullets(body.bullets)
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_TEMPLATES_SQL))
            _require_unlocked(_require_template(conn, template_id))
            _check_section(conn, body.section_id, template_id)
            criterion_id = conn.execute(text(NEXT_CRITERION_ID_SQL)).scalar_one()
            order = body.display_order
            if order is None:
                order = conn.execute(text(NEXT_CRITERION_ORDER_SQL), {"template_id": template_id}).scalar_one()
            conn.execute(
                text(INSERT_CRITERION_SQL),
                {
                    "criterion_id": criterion_id,
                    "template_id": template_id,
                    "name": body.name.strip(),
                    "description": body.description,
                    "section_id": body.section_id,
                    "display_order": order,
                    "guidance": body.guidance,
                    "applies_to": body.applies_to,
                    "is_active": body.is_active,
                    "is_required": body.is_required,
                    "notes_on_low_rating": body.notes_on_low_rating,
                },
            )
            _write_bullets(conn, criterion_id, bullets)
            conn.execute(text(TOUCH_TEMPLATE_SQL), {"template_id": template_id, **_now()})
            return next(c for c in _full_template(conn, template_id)["criteria"] if c["criterion_id"] == criterion_id)
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee edits a criterion on an unlocked template (AHC-280). Fields left out stay the same.
@router.put("/criteria/{criterion_id}")
def update_criterion(criterion_id: int, body: CriterionUpdate):
    # Input: criterion_id and any fields to change
    # Output: the updated criterion
    _check_criterion_fields(body.name, body.applies_to)
    bullets = _clean_bullets(body.bullets) if body.bullets is not None else None
    try:
        with engine.begin() as conn:
            row = conn.execute(text(CRITERION_ROW_SQL), {"criterion_id": criterion_id}).mappings().first()
            if row is None:
                raise HTTPException(status_code=404, detail="Criterion not found")
            _require_unlocked(_require_template(conn, row["templateid"]))
            sent = body.model_dump(exclude_unset=True)
            if "section_id" in sent:
                _check_section(conn, body.section_id, row["templateid"])
            values = {
                "criterion_id": criterion_id,
                "name": body.name.strip() if body.name is not None else row["criterionname"],
                "description": sent.get("description", row["description"]),
                "section_id": sent.get("section_id", row["sectionid"]),
                "display_order": body.display_order if body.display_order is not None else row["displayorder"],
                "guidance": sent.get("guidance", row["guidance"]),
                "applies_to": body.applies_to or row["appliesto"],
                "is_active": row["isactive"] if body.is_active is None else body.is_active,
                "is_required": row["isrequired"] if body.is_required is None else body.is_required,
                "notes_on_low_rating": row["notesonlowrating"] if body.notes_on_low_rating is None else body.notes_on_low_rating,
            }
            conn.execute(text(UPDATE_CRITERION_SQL), values)
            if bullets is not None:
                _write_bullets(conn, criterion_id, bullets)
            conn.execute(text(TOUCH_TEMPLATE_SQL), {"template_id": row["templateid"], **_now()})
            return next(c for c in _full_template(conn, row["templateid"])["criteria"] if c["criterion_id"] == criterion_id)
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: committee deletes a criterion from an unlocked template (AHC-280).
@router.delete("/criteria/{criterion_id}")
def delete_criterion(criterion_id: int):
    # Input: criterion_id
    # Output: the template's remaining criteria (409 if the template is locked or the criterion was already rated)
    try:
        with engine.begin() as conn:
            row = conn.execute(text(CRITERION_ROW_SQL), {"criterion_id": criterion_id}).mappings().first()
            if row is None:
                raise HTTPException(status_code=404, detail="Criterion not found")
            _require_unlocked(_require_template(conn, row["templateid"]))
            if conn.execute(text(CRITERION_RATED_SQL), {"criterion_id": criterion_id}).first():
                raise HTTPException(
                    status_code=409,
                    detail="An observation already has a rating for this criterion. Mark it inactive instead.",
                )
            conn.execute(text(DELETE_BULLETS_SQL), {"criterion_id": criterion_id})
            conn.execute(text(DELETE_CRITERION_SQL), {"criterion_id": criterion_id})
            conn.execute(text(TOUCH_TEMPLATE_SQL), {"template_id": row["templateid"], **_now()})
            return _full_template(conn, row["templateid"])
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))
