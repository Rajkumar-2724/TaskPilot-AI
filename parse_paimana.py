import urllib.request
import json
import re

base_url = 'https://paimana-proj.mospi.gov.in'

# Fetch all project data
all_projects = []
for fyear in ['2025-26', '2026-27']:
    try:
        url = f'{base_url}/ReportPage/Report?fyear={fyear}&month=0&quater=0&reportType=N'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=30)
        data = resp.read().decode('utf-8', errors='ignore')
        result = json.loads(data)
        html = result.get('html', '')
        
        if not html:
            print(f'{fyear}: No HTML data')
            continue
        
        # Extract table rows
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
        print(f'{fyear}: Found {len(rows)} table rows')
        
        # Parse each row for project data
        for row in rows:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if len(cells) >= 5:
                project = {}
                for i, cell in enumerate(cells):
                    # Clean HTML tags from cells
                    clean = re.sub(r'<[^>]+>', '', cell).strip()
                    if i == 0:
                        project['serial'] = clean
                    elif i == 1:
                        project['name'] = clean
                    elif i == 2:
                        project['code'] = clean
                    elif i == 3:
                        project['state'] = clean
                    elif i == 4:
                        project['sector'] = clean
                if 'name' in project:
                    project['financial_year'] = fyear
                    all_projects.append(project)
        
        # Also look for row data in the table
        # Try to extract data from table cells more comprehensively
        tbody_match = re.search(r'<tbody>(.*?)</tbody>', html, re.DOTALL)
        if tbody_match:
            tbody = tbody_match.group(1)
            data_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tbody, re.DOTALL)
            print(f'{fyear}: Found {len(data_rows)} tbody rows')
        
        print(f'{fyear}: Parsed {sum(1 for p in all_projects if p.get("financial_year") == fyear)} projects')
        
    except Exception as e:
        print(f'{fyear}: Error - {e}')

print(f'\nTotal projects: {len(all_projects)}')
if all_projects:
    print('\nFirst 5 projects:')
    for p in all_projects[:5]:
        print(f'  {p}')

# Save all data
with open('paimana_data.json', 'w') as f:
    json.dump(all_projects, f, indent=2)
print('\nData saved to paimana_data.json')
