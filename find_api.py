import urllib.request
import re

url = 'https://paimana-proj.mospi.gov.in/ReportPage'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, timeout=15)
    content = resp.read().decode('utf-8', errors='ignore')
    
    # Find the flashReport function and getFin function
    script_matches = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
    
    for i, s in enumerate(script_matches):
        if 'flashReport' in s or 'getFin' in s or 'ajax' in s.lower() or 'fetch' in s.lower():
            # Find AJAX/API calls
            ajax_matches = re.findall(r'\$\.ajax[^}]+\}', s, re.DOTALL)
            for a in ajax_matches:
                print(f'AJAX: {a[:300]}')
                print('---')
            
            # Find any URL patterns
            url_matches = re.findall(r'["\']([^"\']*(?:api|report|fetch|data)[^"\']*)["\']', s)
            for u in url_matches:
                print(f'URL: {u}')
            
            # Find the flashReport function body
            if 'function flashReport' in s:
                start = s.index('function flashReport')
                end = s.index('}', start) + 1
                print(f'\nflashReport function ({end-start} chars):')
                print(s[start:end])
            
            if 'function getFin' in s:
                start = s.index('function getFin')
                end = s.index('}', start) + 1
                print(f'\ngetFin function ({end-start} chars):')
                print(s[start:end])
            
except Exception as e:
    print(f'Error: {e}')
