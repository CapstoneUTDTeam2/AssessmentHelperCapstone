from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["observer-requests"])


# What: reject any request whose proposed observation dates are on/after
#       EvaluationCycle.ObservationDeadLine for that signup's cycle.
def proposed_dates_before_deadline(proposed_dates, cycle_id):
    # Input: proposed_dates (list of dates), cycle_id
    # Output: True if every date is before the deadline; False otherwise
    ...


# What: observee sends observation requests to all or a subset of the
#       5 recommended observers.
@router.post("/observer-requests")
def send_observer_requests(signup_id, observee_id, observer_ids, proposed_dates):
    # Input: signup_id, observee_id, observer_ids (1-5 from the match list), proposed_dates
    # Output: the created pending ObserverRequest records
    ...


# What: observer views incoming requests sent to them.
@router.get("/observer-requests")
def list_incoming_observer_requests(observer_id):
    # Input: observer_id (the logged-in professor)
    # Output: ObserverRequest rows for that observer (signup, observee, dates, status)
    ...


# What: return all accepted confirmations to the observer.
@router.get("/observer-requests/accepted")
def list_accepted_confirmations(observer_id):
    # Input: observer_id
    # Output: ObserverRequest rows this observer has accepted
    ...


# What: automatically send grateful declines to other confirmed observers.
def send_grateful_declines(signup_id, selected_observer_id):
    # Input: signup_id, selected_observer_id
    # Output: other accepted ObserverRequest rows for this signup, now declined
    ...


# What: store the final selected observer.
def store_selected_observer(signup_id, observer_id):
    # Input: signup_id, observer_id
    # Output: Observation row with ObserverProfessorID set
    ...


# What: allow the observee to choose one observer after receiving one or more
#       confirmations.
@router.post("/signups/{signup_id}/select-observer")
def choose_observer(signup_id, observee_id, observer_id):
    # Input: signup_id, observee_id, observer_id (must have accepted)
    # Output: the stored Observation plus grateful declines to the other confirmed observers
    ...
