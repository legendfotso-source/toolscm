@echo off
chcp 65001 >nul
title Tools.cm - envoi sur GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ENVOYER-TOOLSCM.ps1"
