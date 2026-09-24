import urllib.request
import re
import json

url = 'https://paimana-proj.mospi.gov.in/ReportPage'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    resp = urllib.request.urlopen(req, timeout=15)
    content = resp.read().decode('utf-8', errors='ignore')
    print(f'Status: {resp.status}, Length: {len(content)}')
    
    api_matches = re.findall(r'(?:fetch|axios|\.get|\.post|\.put)[^"\'\)]+', content)
    for m in api_matches[:20]:
        print(f'API: {m}')
    
    script_matches = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
    for i, s in enumerate(script_matches):
        if len(s) > 100:
            print(f'\nScript {i} ({len(s)} chars):')
            print(s[:500])
except Exception as e:
    print(f'Error: {e}')
