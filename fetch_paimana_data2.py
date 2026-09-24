import urllib.request
import json
import re

base_url = 'https://paimana-proj.mospi.gov.in'

# Try different parameter combinations
params_to_try = [
    ('2025-26', '0', '0', 'N'),
    ('2025-26', '0', '0', 'M'),
    ('2025-26', '12', '0', 'M'),
    ('2025-26', '12', '0', ''),
    ('2026-27', '0', '0', 'N'),
    ('2025-26', 'December', '0', 'M'),
    ('2025-26', 'December', '0', ''),
]

for fyear, month, quater, reportType in params_to_try:
    try:
        url = f'{base_url}/ReportPage/Report?fyear={fyear}&month={month}&quater={quater}&reportType={reportType}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=15)
        data = resp.read().decode('utf-8', errors='ignore')
        print(f'Params: fyear={fyear}, month={month}, quater={quater}, reportType={reportType}')
        print(f'Response ({len(data)} chars): {data[:300]}')
        print('---')
    except Exception as e:
        print(f'Params: fyear={fyear}, month={month}, quater={quater}, reportType={reportType}')
        print(f'Error: {e}')
        print('---')
