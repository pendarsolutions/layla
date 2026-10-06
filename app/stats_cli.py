"""Print traffic per day from the database.

    docker compose exec layla-api python -m app.stats_cli            # last 30 days
    docker compose exec layla-api python -m app.stats_cli --days 7 --json

Numbers reach the database within a minute (LAYLA_TRAFFIC_FLUSH_S) of each request.
"""
import argparse
import json

from . import config
from .db import Database
from .traffic import Traffic


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--json", action="store_true", help="print the raw report as JSON")
    a = ap.parse_args()
    rep = Traffic(Database(config.load().database_url), "").report(max(1, a.days))
    if a.json:
        print(json.dumps(rep, indent=2))
        return
    print(f"accounts: {rep['users']['total']} total, {rep['users']['with_keys']} with an API key\n")
    print(f"{'day':<11}{'requests':>9}{'failed':>8}{'anon':>7}{'keys':>7}{'operator':>9}{'visitors':>10}{'active':>8}{'new':>5}")
    for r in rep["days"]:
        c = r["by_channel"]
        print(f"{r['day']:<11}{r['requests']:>9}{r['failed']:>8}{c['anonymous']:>7}{c['user_key']:>7}{c['operator_key']:>9}"
              f"{r['anonymous_visitors']:>10}{r['active_users']:>8}{r['new_users']:>5}")
    t = rep["totals"]
    print(f"\n{a.days} days: {t['requests']} requests, {t['new_users']} new accounts "
          f"(visitors are unique per day, so they are not summed across days)")


if __name__ == "__main__":
    main()
