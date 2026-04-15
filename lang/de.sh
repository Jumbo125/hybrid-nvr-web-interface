LANG_NAME="Deutsch"

declare -gA MSG=(
  [ok]="OK"
  [error]="FEHLER"

  [check_python]="Prüfe Python..."
  [python_install_try]="Python3 nicht gefunden. Versuche automatische Installation..."
  [python_install_failed]="Fehler: Python3 konnte nicht installiert werden."
  [requirements_missing]="Fehler: requirements.txt wurde nicht gefunden."

  [sudo_required_packages]="Fehler: Root-Rechte oder sudo werden benötigt, um Pakete zu installieren."
  [sudo_required]="Fehler: Root-Rechte oder sudo werden benötigt."

  [install_missing_venv_pkg]="Installiere fehlendes venv-Paket für Python %s ..."
  [install_pkg_primary]="Installation: %s, %s"
  [install_pkg_fallback_try]="Fallback: versuche %s ..."
  [unsupported_package_manager]="Fehler: Kein unterstützter Paketmanager gefunden."

  [venv_exists_ok]="Virtuelle Umgebung existiert bereits und ist nutzbar."
  [venv_incomplete_remove]="Vorhandene venv ist unvollständig oder defekt. Entferne sie..."
  [venv_create]="Erstelle virtuelle Umgebung..."
  [venv_create_repair_try]="Versuche automatische Reparatur für Debian/Ubuntu..."
  [venv_create_failed]="Fehler: Die virtuelle Umgebung konnte nicht erstellt werden."

  [pip_in_venv_present]="pip in venv vorhanden"
  [pip_missing_in_venv]="pip fehlt in der venv. Versuche ensurepip..."
  [ensurepip_result]="ensurepip (venv)"
  [pip_in_venv_provided]="pip in venv bereitgestellt"
  [repair_debian_and_rebuild]="Repariere Debian/Ubuntu-Pakete und baue venv neu..."
  [pip_after_repair_present]="pip nach Reparatur vorhanden"
  [pip_setup_failed]="Fehler: pip konnte nicht eingerichtet werden."

  [requirements_file_missing]="Fehler: Requirements-Datei nicht gefunden: %s"
  [read_more_requirements]="Lese weitere Requirements: %s"
  [constraint_set]="Constraint gesetzt: %s"
  [pip_option_set]="pip Option gesetzt: %s"
  [installing_pkg]="Installiere: %s"

  [upgrade_pip]="Upgrade pip..."
  [pip_upgrade]="pip Upgrade"
  [install_requirements]="Installiere Abhängigkeiten aus requirements.txt ..."
  [failed_dependencies]="Folgende Abhängigkeiten konnten nicht installiert werden:"

  [installation_finished]="Installation abgeschlossen."
  [start_project_with]="Starte dein Projekt mit:"
  [start_script_name]="start.sh"

  [start_script_missing]="start.sh nicht gefunden: %s"
  [venv_python_missing]="Virtuelle Umgebung nicht gefunden: %s"
  [service_installing]="Installiere und starte Service: %s"
  [service_installed_started]="Service installiert und gestartet."
  [status_check_with]="Status prüfen mit:"
  [logs_view_with]="Logs ansehen mit:"

  [unknown_parameter]="Unbekannter Parameter: %s"
  [lang_requires_value]="Fehler: --lang braucht einen Wert."
  [unknown_language]="Unbekannte Sprache: %s"
  [allowed_languages]="Erlaubt: %s"
)
