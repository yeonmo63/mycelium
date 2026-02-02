
try:
    with open('src-tauri/src/lib.rs', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for i, line in enumerate(lines):
        if "fn get_dashboard_stats" in line:
            print(f"{i+1}: {line.strip()}")
except Exception as e:
    print(e)
