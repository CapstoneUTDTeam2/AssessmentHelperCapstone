ASSISTANT_FREQUENCY_YEARS = 1
ASSOCIATE_FULL_FREQUENCY_YEARS = 2

LEVEL_FREQUENCY_YEARS = {
    "assistant professor": ASSISTANT_FREQUENCY_YEARS,
    "assistant": ASSISTANT_FREQUENCY_YEARS,
    "associate professor": ASSOCIATE_FULL_FREQUENCY_YEARS,
    "associate": ASSOCIATE_FULL_FREQUENCY_YEARS,
    "full professor": ASSOCIATE_FULL_FREQUENCY_YEARS,
    "full": ASSOCIATE_FULL_FREQUENCY_YEARS,
}

STATUS_DUE = "Due"
STATUS_OVERDUE = "Overdue"
STATUS_NOT_DUE = "Not Due"
STATUS_UNKNOWN = "Unknown"


# What: return how often a professor must be evaluated, in calendar years.
def evaluation_frequency_years(current_level):
    # Input: CurrentLevel from Professors (Assistant / Associate / Full)
    # Output: 1 for Assistant, 2 for Associate or Full, None if the level is unknown
    if current_level is None:
        return None
    return LEVEL_FREQUENCY_YEARS.get(current_level.strip().lower())


# What: map a completed evaluation date to the Spring/Fall cycle it belongs to.
def semester_from_date(completed_date):
    # Input: last completed evaluation date
    # Output: "Spring" (Jan-May) or "Fall" (Jun-Dec); summer dates follow the Fall cycle
    if completed_date is None:
        return None
    if completed_date.month <= 5:
        return "Spring"
    return "Fall"


# What: compute the next required evaluation term from rank and last evaluation.
def next_due_term(last_evaluation_date, frequency_years):
    # Input: last completed evaluation date, frequency in calendar years (1 or 2)
    # Output: (year, semester) when they are next due, or (None, None)
    if last_evaluation_date is None or frequency_years is None:
        return None, None
    semester = semester_from_date(last_evaluation_date)
    return last_evaluation_date.year + frequency_years, semester


def _term_order(year, semester):
    return year * 2 + (0 if semester == "Spring" else 1)


# What: classify a professor as Due, Overdue, Not Due, or Unknown for a cycle.
def evaluation_status(
    current_year,
    current_semester,
    current_level,
    start_year=None,
    start_semester=None,
    last_evaluation_date=None,
):
    # Input: current cycle term, professor level, start term, last completed eval date
    # Output: status string plus frequency_years, next_due_year, next_due_semester
    frequency_years = evaluation_frequency_years(current_level)
    next_due_year, next_due_semester = next_due_term(
        last_evaluation_date, frequency_years
    )

    if current_year is None or current_semester not in ("Spring", "Fall"):
        status = STATUS_UNKNOWN
    elif frequency_years is None:
        status = STATUS_UNKNOWN
    elif start_year == current_year and start_semester == current_semester:
        status = STATUS_NOT_DUE
    elif last_evaluation_date is None:
        status = STATUS_DUE
    elif next_due_year is None or next_due_semester is None:
        status = STATUS_UNKNOWN
    else:
        current = _term_order(current_year, current_semester)
        due = _term_order(next_due_year, next_due_semester)
        if due < current:
            status = STATUS_OVERDUE
        elif due == current:
            status = STATUS_DUE
        else:
            status = STATUS_NOT_DUE

    return {
        "frequency_years": frequency_years,
        "next_due_year": next_due_year,
        "next_due_semester": next_due_semester,
        "status": status,
        "last_evaluation_date": last_evaluation_date,
    }
