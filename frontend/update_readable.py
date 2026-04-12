import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'text-slate-400': 'text-slate-600',
        'text-slate-500': 'text-slate-700 font-medium',
        'text-slate-300': 'text-slate-600',
        'text-[#4F46E5]/80': 'text-[#4F46E5]', # remove opacity
        'opacity-40': 'opacity-70', # make disabled things more visible
        'text-slate-200': 'text-slate-600',
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

print("Legibility Update: Darker text applied.")
