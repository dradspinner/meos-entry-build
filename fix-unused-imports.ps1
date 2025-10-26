# Fix Unused Imports Script
# Automatically removes unused imports and variables flagged by TypeScript

Write-Host "Analyzing TypeScript errors..." -ForegroundColor Cyan

# Get all TS6133, TS6196, TS6198 errors
$errors = npm run build 2>&1 | Select-String "error TS6(133|196|198)"

$filesToFix = @{}

foreach ($error in $errors) {
    if ($error -match "^(.+?)\((\d+),(\d+)\): error TS6\d+: '(.+?)' is declared") {
        $file = $matches[1]
        $line = [int]$matches[2]
        $unused = $matches[4]
        
        if (-not $filesToFix.ContainsKey($file)) {
            $filesToFix[$file] = @()
        }
        
        $filesToFix[$file] += @{
            Line = $line
            Name = $unused
        }
    }
}

Write-Host "Found $($filesToFix.Count) files with unused declarations" -ForegroundColor Yellow

foreach ($file in $filesToFix.Keys) {
    Write-Host "`nProcessing: $file" -ForegroundColor Green
    
    $content = Get-Content $file -Raw
    $lines = Get-Content $file
    
    $unusedNames = $filesToFix[$file] | ForEach-Object { $_.Name } | Select-Object -Unique
    
    foreach ($name in $unusedNames) {
        # Remove from imports
        $content = $content -replace ",\s*$name\s*,", ","  # Middle of list
        $content = $content -replace ",\s*$name\s*\}", "}"  # End of list
        $content = $content -replace "\{\s*$name\s*,", "{"  # Start of list
        $content = $content -replace "\{\s*$name\s*\}", ""  # Only item
        
        # Remove standalone declarations
        $content = $content -replace "const\s+$name\s*=.+?;", ""
        $content = $content -replace "let\s+$name\s*=.+?;", ""
        $content = $content -replace "import\s+$name\s+from.+?;", ""
        
        Write-Host "  - Removed: $name" -ForegroundColor Gray
    }
    
    # Clean up empty import lines
    $content = $content -replace "import\s*\{\s*\}\s*from.+?;\r?\n", ""
    
    Set-Content $file -Value $content -NoNewline
}

Write-Host "`nDone! Run 'npm run build' to check remaining errors." -ForegroundColor Cyan
