Add-Type -AssemblyName System.Windows.Forms
$result = [System.Windows.Forms.MessageBox]::Show("Axum 서버(Celium)를 가동하시겠습니까?`n(이미 실행 중인 경우 재시작됩니다)", "Celium", [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question)

if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
    # 1. Kill existing backend process
    $procName = "celium-backend"
    $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
    
    # 2. Run backend
    try {
        Set-Location "d:\workspace\rust\mycelium\backend"
        # Start cargo run in hidden mode
        Start-Process -FilePath "cargo" -ArgumentList "run", "--release" -WindowStyle Hidden
        [System.Windows.Forms.MessageBox]::Show("서버가 백그라운드에서 시작되었습니다.", "성공", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
    } catch {
        [System.Windows.Forms.MessageBox]::Show("서버 시작 중 오류가 발생했습니다: " + $_.Exception.Message, "오류", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    }
}
