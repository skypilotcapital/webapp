import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'rounded-2xl': 'rounded-none',
        'rounded-3xl': 'rounded-none',
        'border-black/5': 'border-black',
        'border-black/10': 'border-black',
        'border-2 border-black': 'border-2 border-black', # no change needed but for consistency
        'text-slate-900': 'text-black',
        'text-4xl font-bold': 'text-6xl font-black uppercase tracking-tighter',
        'text-sky-600': 'text-black',
        'text-blue-600': 'text-black',
        'text-teal-600': 'text-black',
        'text-indigo-600': 'text-black',
        'text-rose-600': 'text-black',
        'shadow-sm': 'shadow-none',
        'shadow-xl': 'shadow-none',
        'bg-slate-50': 'bg-white',
        'uppercase tracking-widest': 'uppercase tracking-[0.2em] font-black',
        'text-slate-500': 'text-slate-700',
        'text-slate-600': 'text-slate-900',
        'divide-black/[0.03]': 'divide-black',
        'hover:bg-black/[0.02]': 'hover:bg-black hover:text-white',
        'font-black': 'font-black', # ensure consistency
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

print("Swiss Minimalist component replacements done.")
