LANG_NAME="English"

declare -gA MSG=(
  [ok]="OK"
  [error]="ERROR"

  [check_python]="Checking Python..."
  [python_install_try]="Python3 not found. Trying automatic installation..."
  [python_install_failed]="Error: Python3 could not be installed."
  [requirements_missing]="Error: requirements.txt was not found."

  [sudo_required_packages]="Error: root privileges or sudo are required to install packages."
  [sudo_required]="Error: root privileges or sudo are required."

  [install_missing_venv_pkg]="Installing missing venv package for Python %s ..."
  [install_pkg_primary]="Installation: %s, %s"
  [install_pkg_fallback_try]="Fallback: trying %s ..."
  [unsupported_package_manager]="Error: No supported package manager found."

  [venv_exists_ok]="Virtual environment already exists and is usable."
  [venv_incomplete_remove]="Existing venv is incomplete or broken. Removing it..."
  [venv_create]="Creating virtual environment..."
  [venv_create_repair_try]="Trying automatic repair for Debian/Ubuntu..."
  [venv_create_failed]="Error: The virtual environment could not be created."

  [pip_in_venv_present]="pip in venv is available"
  [pip_missing_in_venv]="pip is missing in the venv. Trying ensurepip..."
  [ensurepip_result]="ensurepip (venv)"
  [pip_in_venv_provided]="pip in venv has been provided"
  [repair_debian_and_rebuild]="Repairing Debian/Ubuntu packages and rebuilding venv..."
  [pip_after_repair_present]="pip present after repair"
  [pip_setup_failed]="Error: pip could not be set up."

  [requirements_file_missing]="Error: requirements file not found: %s"
  [read_more_requirements]="Reading additional requirements: %s"
  [constraint_set]="Constraint set: %s"
  [pip_option_set]="pip option set: %s"
  [installing_pkg]="Installing: %s"

  [upgrade_pip]="Upgrading pip..."
  [pip_upgrade]="pip upgrade"
  [install_requirements]="Installing dependencies from requirements.txt ..."
  [failed_dependencies]="The following dependencies could not be installed:"

  [installation_finished]="Installation completed."
  [start_project_with]="Start your project with:"
  [start_script_name]="start.sh"

  [start_script_missing]="start.sh not found: %s"
  [venv_python_missing]="Virtual environment not found: %s"
  [service_installing]="Installing and starting service: %s"
  [service_installed_started]="Service installed and started."
  [status_check_with]="Check status with:"
  [logs_view_with]="View logs with:"

  [unknown_parameter]="Unknown parameter: %s"
  [lang_requires_value]="Error: --lang requires a value."
  [unknown_language]="Unknown language: %s"
  [allowed_languages]="Allowed: %s"
)
