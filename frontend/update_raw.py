import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'text-brand-navy': 'text-[#0F172A]',
        'text-brand-blue': 'text-[#0284C7]',
        'bg-brand-navy': 'bg-[#0F172A]',
        'bg-brand-blue': 'bg-[#0284C7]',
        '#F8FAFC': '#F8FAFC', # already correct
        'bg-white/70': 'bg-white', # simpler for now
        'text-slate-900': 'text-[#0F172A]',
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

print("Light Institutional (Final RAW) component replacements done.")
