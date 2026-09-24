import urllib.request
import json
import re

base_url = 'https://paimana-proj.mospi.gov.in'

# First, get financial year list
try:
    req = urllib.request.Request(f'{base_url}/ReportPage/GetFinancialYearList', headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, timeout=15)
    data = resp.read().decode('utf-8', errors='ignore')
    print(f'Financial Years Response ({len(data)} chars):')
    print(data[:500])
    print('---')
    
    # Try to parse as JSON
    try:
        years = json.loads(data)
        print(f'Years: {years[:5] if isinstance(years, list) else years}')
    except:
        print('Not JSON, looking for array...')
        matches = re.findall(r'"([^"]*20\d\d[^"]*)"', data)
        print(f'Year matches: {matches[:10]}')
except Exception as e:
    print(f'Error getting financial years: {e}')

# Now try to get report data with a recent financial year
print('\n--- Trying to fetch report ---')
try:
    # Try with latest financial year
    url = f'{base_url}/ReportPage/Report?fyear=2025-2026&month=0&quater=0&reportType=N'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, timeout=30)
    data = resp.read().decode('utf-8', errors='ignore')
    print(f'Report Response ({len(data)} chars):')
    
    # Look for table data or project names
    if 'table' in data.lower():
        # Find all table rows with project info
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', data, re.DOTALL)
        print(f'Found {len(rows)} table rows')
        
        # Find project names
        project_names = re.findall(r'<td[^>]*>([^<]+)</td>', data)
        print(f'Found {len(project_names)} cells')
        # Print first 20 cell values
        for i, cell in enumerate(project_names[:30]):
            print(f'  Cell {i}: {cell.strip()[:100]}')
    else:
        print(data[:1000])
except Exception as e:
    print(f'Error getting report: {e}')
