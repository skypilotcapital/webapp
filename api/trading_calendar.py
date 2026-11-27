"""Scheduled NYSE closures, without pandas (the API venv has none).

A copy of the RULES in the data repo's `pipeline/trading_calendar.py`, which is cross-checked
against 25 years of `clean.prices` by `scripts/check_trading_calendar.py`. This copy is checked
against that module for every date 1990-2040 (`api/tests/test_trading_calendar.py` holds the
fixed dates; the full-range comparison is in the commit that added it). If NYSE adds a holiday,
change BOTH.

Why the Today page needs it: on the Friday after Thanksgiving the poll's base is Wednesday's
book, and Thursday is a weekday with no index level. Without a calendar the page cannot tell a
holiday from a session whose data is late, so it withheld every S&P comparison (2026-11-27).

Unscheduled closures (national days of mourning, 9/11, Sandy) are not derivable from any rule;
on such a day the page still withholds the comparison, which is the safe direction.
"""
from __future__ import annotations

import datetime as dt
import functools

D = dt.date


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> D:
    """n-th (1-based) `weekday` (Mon=0) of the month; n=-1 is the last one."""
    if n > 0:
        first = D(year, month, 1)
        return first + dt.timedelta(days=(weekday - first.weekday()) % 7 + 7 * (n - 1))
    last = (D(year + (month == 12), month % 12 + 1, 1)) - dt.timedelta(days=1)
    return last - dt.timedelta(days=(last.weekday() - weekday) % 7)


def _easter(year: int) -> D:
    """Gregorian Easter Sunday (anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return D(year, month, day)


def _nearest_workday(d: D) -> D:
    """Saturday -> Friday before, Sunday -> Monday after."""
    return d - dt.timedelta(days=1) if d.weekday() == 5 else (
        d + dt.timedelta(days=1) if d.weekday() == 6 else d)


def _year_holidays(year: int) -> set:
    h = set()
    # New Year's Day: Sunday -> Monday only. A Saturday Jan 1 is NOT observed on Dec 31
    # (the last business day of the year trades) — see the data repo module.
    ny = D(year, 1, 1)
    if ny.weekday() == 6:
        h.add(ny + dt.timedelta(days=1))
    elif ny.weekday() < 5:
        h.add(ny)
    h.add(_nth_weekday(year, 1, 0, 3))                 # Martin Luther King Jr.
    h.add(_nth_weekday(year, 2, 0, 3))                 # Presidents' Day
    h.add(_easter(year) - dt.timedelta(days=2))        # Good Friday
    h.add(_nth_weekday(year, 5, 0, -1))                # Memorial Day
    if year >= 2022:                                   # Juneteenth, first closed 2022-06-20
        h.add(_nearest_workday(D(year, 6, 19)))
    h.add(_nearest_workday(D(year, 7, 4)))             # Independence Day
    h.add(_nth_weekday(year, 9, 0, 1))                 # Labor Day
    h.add(_nth_weekday(year, 11, 3, 4))                # Thanksgiving
    h.add(_nearest_workday(D(year, 12, 25)))           # Christmas
    return h


@functools.lru_cache(maxsize=64)
def _holidays(year: int) -> frozenset:
    # A Saturday Christmas/July 4 is observed on the Friday of the SAME year, so a year's own
    # rules cover it; Jan 1 never moves into the previous year (see above).
    return frozenset(x for x in _year_holidays(year) if x.year == year)


def is_trading_day(d: D) -> bool:
    """True on a scheduled NYSE session: a weekday that is not a scheduled holiday."""
    return d.weekday() < 5 and d not in _holidays(d.year)
