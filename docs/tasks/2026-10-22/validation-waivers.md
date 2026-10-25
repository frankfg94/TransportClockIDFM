# Validation dispensee par decision explicite de l’utilisateur

## Lot 01 — IGN

Instruction humaine du 23 octobre 2026 :

> ignore la validation du lot 1 le serveur IGN est down en ce moment tu peux passer à la suite

Le lot 01 est accepte pour poursuivre cette livraison avec une dispense de sa validation externe restante. Les marches IGN et le Verdict reel sur le code final ne sont pas declares valides. Les correctifs et validations de code deja realises sont conserves, ainsi que les preuves d’indisponibilite publique IGN. Aucun nouveau diagnostic IGN n’est requis pour passer a la suite.

Les lots 02 a 11 sont valides. Le lot 12 reste tenu de compiler et executer l’etat integre sur emulateur Android et de verifier ses interactions, en consignant honnetement la limite IGN dispensee du lot 01. La dispense ne vaut pas reussite des autres scenarios du smoke.

Le lot 13 attend la reussite du smoke Android 12 sur l’etat a publier ; build final, installation/lancement, publication R2, telechargement/version/references restent obligatoires. Le commit/push attend la realisation et validation de ces autres exigences et tient compte de la presente acceptation humaine du lot 01. Les changements preexistants et secrets restent exclus des operations Git selon execution.json.

Cette decision humaine est prioritaire sur les anciennes mentions exigeant une validation IGN complete du lot 01 avant les lots suivants.
