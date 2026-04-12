import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'text-brand-blue': 'text-[#4F46E5]',
        'text-[#0284C7]': 'text-[#4F46E5]',
        'bg-[#0284C7]': 'bg-[#4F46E5]',
        'bg-brand-navy': 'bg-[#0F172A]',
        'text-slate-900': 'text-[#0F172A]',
        'font-black tracking-tight': 'font-bold tracking-tight', # soft revert
        'uppercase tracking-widest': 'uppercase tracking-[0.1em]', # softer tracking
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

print("Natural Nordic (v2) component replacements done.")
