import sys

file_path = "src-tauri/src/lib.rs"

# Ranges to delete (1-indexed, inclusive start, inclusive end)
ranges = [
    (710, 725),
    (1387, 1471),
    (1479, 2343),
    (2533, 2589) # Let's keep 2590 if it is just a newline, but view_file said 2590 is }.
                 # 2589 is }. 2590 might be newline.
                 # Let's check view_file 2500-2600 again.
                 # 2589: } (End of function).
                 # 2590: Empty line.
                 # So delete 2533 to 2589.
]

# Read file
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Filter lines
# Adjust to 0-indexed
lines_to_keep = []
current_line = 1
for line in lines:
    keep = True
    for start, end in ranges:
        if start <= current_line <= end:
            keep = False
            break
    if keep:
        lines_to_keep.append(line)
    current_line += 1

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines_to_keep)

print("Ranges deleted successfully.")
