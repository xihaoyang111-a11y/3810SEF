@echo off
setlocal EnableDelayedExpansion
rem The API answers in UTF-8. Switch this window to UTF-8 so the campus
rem label dot is shown correctly instead of a stray Chinese character.
chcp 65001 >nul
echo Script version: windows-cmd-11
echo Leave the server window open. This file runs in Command Prompt, not Bash.
echo Six calls: GET, GET search, POST, PUT, DELETE, then check both results.
set BASE=http://localhost:8099

call :wait
set "STEPURL=%BASE%/api/items/K184206"
set STEPTXT=Read one lost item: "House keys"
call :title "1/6  GET"
curl.exe -s "!STEPURL!" > "%TEMP%\lostdesk-out.json"
call :showjson
echo.
echo  Look for: House keys, reference K184206, status stored.

call :wait
set "STEPURL=%BASE%/api/items?category=electronics&status=stored"
set STEPTXT=Search for stored electronics.
call :title "2/6  GET"
echo  Search for: category electronics, and status stored.
curl.exe -s "!STEPURL!" > "%TEMP%\lostdesk-out.json"
call :showjson
echo.
echo  Look for: AirPods case, USB-C charger, Casio calculator.

call :wait
set "STEPURL=%BASE%/api/items"
set STEPTXT=Creates a new lost item. "Black cap"
call :title "3/6  POST"
echo  New lost item: Black cap, clothing, Main Campus library.
> "%TEMP%\lostdesk-body.json" echo {"name":"Black cap","category":"clothing","place":"library","campus":"MC","status":"stored","foundOn":"2026-11-19","spot":"Bin B3","description":"No name inside"}
curl.exe -s -X POST "%BASE%/api/items" -H "Content-Type: application/json" --data-binary "@%TEMP%\lostdesk-body.json" > "%TEMP%\lostdesk-out.json"
call :showjson
echo.
set CODE=
for /f "usebackq delims=" %%L in ("%TEMP%\lostdesk-out.json") do set LINE=%%L
for /f "tokens=2 delims=:," %%A in ("!LINE!") do set CODE=%%~A
echo  New reference: !CODE!
echo  Look for: a new reference number that starts with C.
if "!CODE!"=="" (
  echo  Could not read the new reference. Stop here.
  pause
  exit /b 1
)

call :wait
set "STEPURL=%BASE%/api/items/!CODE!"
set STEPTXT=Update the record of "Black cap".
call :title "4/6  PUT"
echo  Change: status to claimed. Description: Owner collected it at the desk.
> "%TEMP%\lostdesk-update.json" echo {"status":"claimed","description":"Owner collected it at the desk"}
curl.exe -s -X PUT "%BASE%/api/items/!CODE!" -H "Content-Type: application/json" --data-binary "@%TEMP%\lostdesk-update.json" > "%TEMP%\lostdesk-out.json"
call :showjson
echo.
echo  Look for: the same reference !CODE!, now with status claimed.

call :wait
set "STEPURL=%BASE%/api/items/!CODE!"
set STEPTXT=Delete the record of "Black cap".
call :title "5/6  DELETE"
curl.exe -s -X DELETE "%BASE%/api/items/!CODE!" > "%TEMP%\lostdesk-out.json"
call :showjson
echo.
echo  Look for: deleted true, reference !CODE!. The house keys stay in the database.

call :wait
set "STEPURL=%BASE%/api/items/!CODE!"
set STEPTXT=Try to GET the deleted record "Black cap", then the record of "House keys"
call :title "6/6  GET"
curl.exe -s -D "%TEMP%\lostdesk-head.txt" -o NUL "%BASE%/api/items/!CODE!"
for /f "tokens=2" %%S in ('findstr /b "HTTP/" "%TEMP%\lostdesk-head.txt"') do set GONE=%%S
echo  Deleted code !CODE!    HTTP !GONE!
echo  Look for: 404. The new lost item is gone.
echo.
echo  URL   %BASE%/api/items/K184206
curl.exe -s -D "%TEMP%\lostdesk-head.txt" "%BASE%/api/items/K184206" > "%TEMP%\lostdesk-out.json"
for /f "tokens=2" %%S in ('findstr /b "HTTP/" "%TEMP%\lostdesk-head.txt"') do set KEPT=%%S
echo  House keys K184206    HTTP !KEPT!
call :showjson
echo.
echo  Look for: HTTP 200 and reference K184206. The house keys are still there.
echo.
echo Done. Six calls finished.
pause
goto :eof

:wait
echo.
echo ------------------------------------------------------------
echo  Press Enter for the next call...
pause >nul
echo.
exit /b

:title
echo ============================================================
echo  %~1
echo  !STEPTXT!
echo  URL   !STEPURL!
echo ============================================================
exit /b

:showjson
powershell -NoProfile -Command "try { Get-Content -Raw -Encoding UTF8 $env:TEMP\lostdesk-out.json | ConvertFrom-Json | ConvertTo-Json -Depth 8 } catch { Get-Content -Raw -Encoding UTF8 $env:TEMP\lostdesk-out.json }"
exit /b
