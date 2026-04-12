import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'text-white': 'text-[#0F172A]',
        'text-brand-blue': 'text-[#4F46E5]',
        'text-[#0284C7]': 'text-[#4F46E5]',
        'bg-[#0284C7]': 'bg-[#4F46E5]',
        'text-slate-400': 'text-slate-500',
        'font-bold': 'font-black tracking-tight',
        'text-4xl': 'text-2xl', # sub-headers should be cleaner
        'uppercase': 'uppercase tracking-widest',
        'bg-white': 'bg-white/60 backdrop-blur-xl',
        'border-slate-200': 'border-black/5',
        'rounded-none': 'rounded-3xl', # ensure we aren't using the old swiss look
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

print("Natural Nordic Sophistication component replacements done.")
