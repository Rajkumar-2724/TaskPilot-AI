import urllib.request
import json
import re

base_url = 'https://paimana-proj.mospi.gov.in'

# Fetch 2025-26 data
url = f'{base_url}/ReportPage/Report?fyear=2025-26&month=0&quater=0&reportType=N'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
resp = urllib.request.urlopen(req, timeout=30)
data = resp.read().decode('utf-8', errors='ignore')
result = json.loads(data)
html = result.get('html', '')

# Save raw HTML for inspection
with open('paimana_raw.html', 'w') as f:
    f.write(html)

print(f'HTML length: {len(html)}')

# Find table rows
rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
print(f'Found {len(rows)} rows')

# Print first few rows
for i, row in enumerate(rows[:5]):
    cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)
    print(f'\nRow {i}: {len(cells)} cells')
    for j, cell in enumerate(cells):
        clean = re.sub(r'<[^>]+>', '', cell).strip()
        print(f'  Cell {j}: {clean[:100]}')

# Also try to extract the table header
thead_match = re.search(r'<thead>(.*?)</thead>', html, re.DOTALL)
if thead_match:
    thead = thead_match.group(1)
    headers = re.findall(r'<th[^>]*>(.*?)</th>', thead, re.DOTALL)
    print(f'\nHeaders ({len(headers)}):')
    for i, h in enumerate(headers):
        clean = re.sub(r'<[^>]+>', '', h).strip()
        print(f'  {i}: {clean}')

# Check if there are more tables or data
if 'data-' in html or 'project' in html.lower():
    print('\nContains project-related data')
    
# Look for column headers in the table
th_cells = re.findall(r'<th[^>]*>(.*?)</th>', html, re.DOTALL)
print(f'\nAll th cells ({len(th_cells)}):')
for i, th in enumerate(th_cells):
    clean = re.sub(r'<[^>]+>', '', th).strip()
    print(f'  {i}: {clean[:100]}')
