import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'bg-[#08101C]': 'bg-slate-50',
        'bg-white/[0.02]': 'bg-white',
        'bg-white/[0.03]': 'bg-white',
        'bg-white/[0.01]': 'bg-slate-50',
        'border-white/5': 'border-slate-200',
        'border-white/10': 'border-slate-200',
        'text-white': 'text-slate-900',
        'text-brand-teal': 'text-brand-blue',
        'text-teal-400': 'text-brand-blue',
        'text-slate-400': 'text-slate-500',
        'divide-white/5': 'divide-slate-200',
        'hover:bg-white/5': 'hover:bg-slate-50',
        'text-slate-500': 'text-slate-500', # no change
        'shadow-2xl': 'shadow-sm',
        'text-5xl': 'text-4xl', # slightly smaller headers for light mode
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

print("Light Institutional component replacements done.")
