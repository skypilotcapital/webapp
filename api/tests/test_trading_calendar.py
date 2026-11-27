"""NYSE calendar copy + the Today page's starting-point check across a holiday (2026-11-27)."""
import datetime as dt

from api.routers.portfolio_monitor import _chained, _poll_base
from api.trading_calendar import is_trading_day

D = dt.date


def test_fixed_dates():
    closed = [D(2026, 11, 26), D(2026, 12, 25), D(2027, 7, 5), D(2022, 6, 20), D(2026, 4, 3),
              D(2027, 1, 1), D(2022, 12, 26), D(2026, 1, 19), D(2026, 5, 25), D(2026, 9, 7)]
    open_ = [D(2026, 11, 27), D(2021, 12, 31), D(2021, 6, 18), D(2026, 10, 12), D(2026, 11, 11)]
    assert not any(is_trading_day(x) for x in closed)
    assert all(is_trading_day(x) for x in open_)
    assert not is_trading_day(D(2026, 11, 28))          # Saturday


class _Conn:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_a, **_k):
        return self

    def mappings(self):
        return iter(self.rows)


def test_holiday_is_not_a_skipped_session():
    # Friday after Thanksgiving: base Wed 11-25, Thu 11-26 is a holiday with no index level.
    b = _poll_base(_Conn([{"date": D(2026, 11, 25), "tr_level": 100.0}]), D(2026, 11, 25),
                   D(2026, 11, 27))
    assert b == {"stale": False, "chain": 1.0, "prev_date": "2026-11-25", "skipped": []}
    assert _chained(0.01, b) == 0.01


def test_late_trading_day_still_withholds():
    # Tue with base Fri: Monday traded but has no index level yet -> no comparison, base stale.
    b = _poll_base(_Conn([{"date": D(2026, 11, 20), "tr_level": 100.0}]), D(2026, 11, 20),
                   D(2026, 11, 24))
    assert b["stale"] and b["chain"] is None and b["skipped"] == ["2026-11-23"]
    assert _chained(0.01, b) is None


def test_skipped_session_with_level_chains():
    b = _poll_base(_Conn([{"date": D(2026, 11, 20), "tr_level": 100.0},
                          {"date": D(2026, 11, 23), "tr_level": 105.0}]),
                   D(2026, 11, 20), D(2026, 11, 24))
    assert b["stale"] and abs(b["chain"] - 1.05) < 1e-12
    assert abs(_chained(-0.01, b) - (1.05 * 0.99 - 1)) < 1e-12
