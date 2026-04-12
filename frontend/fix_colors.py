import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'bg-[#0B1527]': 'bg-slate-950',
        'bg-cyan-900': 'bg-teal-900',
        'text-cyan-100': 'text-teal-100',
        'text-cyan-400': 'text-teal-400',
        'text-cyan-600': 'text-teal-600',
        'border-cyan-500': 'border-teal-500',
        'border-cyan-400': 'border-teal-400',
        'ring-cyan-400': 'ring-teal-400',
        'bg-cyan-600': 'bg-teal-600',
        'bg-cyan-500': 'bg-teal-500',
        'Internal Dashboard Index': 'Fund Operating Dashboard',
        'rgba(34,211,238': 'rgba(20,184,166',
    }

    for k, v in replacements.items():
        content = content.replace(k, v)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

base_path = 'c:\\Users\\xiaoy\\SPCapital\\Code_Repo\\webapp\\frontend\\app\\'
files = ['layout.tsx', 'page.tsx', 'login/page.tsx', 'monitor/page.tsx']

for f in files:
    try:
        replace_in_file(base_path + f)
    except Exception as e:
        print(f"Error on {f}: {e}")

print("Color fixes applied.")
