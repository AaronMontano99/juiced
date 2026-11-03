"""Resolve PED seed names to Lahman playerIDs. Picks the candidate with the most
career AB whose career overlaps the event; prints anything ambiguous for review."""
import csv, sys, unicodedata
from collections import defaultdict
root = sys.argv[1]
norm = lambda s: unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().lower().replace('.','').replace(' jr','').strip()
people = {}
with open(f'{root}/data/lahman/People.csv', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f): people[r['playerID']] = r
ab = defaultdict(int); yrs = defaultdict(set)
with open(f'{root}/data/lahman/Batting.csv', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['lgID'] in ('AL','NL'):
            ab[r['playerID']] += int(r['AB'] or 0); yrs[r['playerID']].add(int(r['yearID']))
byname = defaultdict(list)
for pid, r in people.items():
    byname[norm(f"{r['nameFirst']} {r['nameLast']}")].append(pid)
out = []
with open(f'{root}/data/seed/ped_events_raw.psv') as f:
    for r in csv.DictReader(f, delimiter='|'):
        c = [p for p in byname.get(norm(r['name']), []) if yrs[p]]
        yr = int(r['event_date'][:4])
        c = sorted(c, key=lambda p: (-(min(yrs[p]) <= yr+1 and max(yrs[p]) >= yr-8), -ab[p]))
        if not c: print('UNRESOLVED', r['name']); continue
        if len(c) > 1: print('AMBIG', r['name'], [(p, min(yrs[p]), max(yrs[p]), ab[p]) for p in c])
        r['player_id'] = c[0]; out.append(r)
cols = ['player_id','name','event_type','event_date','tier','substance','detail','source']
with open(f'{root}/data/seed/ped_events.csv','w',newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore'); w.writeheader(); w.writerows(out)
print(len(out), 'rows written')
