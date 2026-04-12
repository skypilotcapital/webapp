import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'bg-white': 'bg-white/[0.02]',
        'bg-slate-50': 'bg-white/[0.01]',
        'border-black': 'border-white/10',
        'border-white/10': 'border-white/10', # consistency check
        'text-black': 'text-white',
        'text-slate-900': 'text-white font-bold',
        'text-blue-600': 'text-brand-teal',
        'text-sky-600': 'text-brand-teal',
        'text-teal-600': 'text-brand-teal',
        'text-brand-teal': 'text-brand-teal', # already correct
        'bg-teal-50': 'bg-brand-teal/10',
        'text-teal-700': 'text-brand-teal',
    }

    for k, v in replacements.items():
        content = content.replace(k, v)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

base_path = 'c:\\Users\\xiaoy\\SPCapital\\Code_Repo\\webapp\\frontend\\components\\monitor\\'
files = ['TableStatusSection.tsx', 'RunLogSection.tsx', 'FactorCoverageSection.tsx', 'GapDetectionSection.tsx']

for f in files:
    try:
        replace_in_file(base_path + f)
    except Exception as e:
        print(f"Error on {f}: {e}")

print("Institutional Blue (Final) component replacements done.")
