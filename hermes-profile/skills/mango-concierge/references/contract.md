# Mango Agent Contract

Allowed actions: `ASK_FOLLOWUP`, `RECOMMEND`, `EXPLAIN`, `REDIRECT`, `APP_UPSELL`, `NO_RESULT`.

Allowed profile proposals:

- `interest.tags`: array of up to eight short tags explicitly supported by the message.
- `budget.max`: number from 0 through 500, in dollars.
- `availability.days`: array drawn from monday through sunday.
- `availability.time_window`: one of morning, afternoon, evening, tonight, flexible.
- `location.neighborhood`: short Stamford-area label explicitly supplied by the user.
- `social.opt_in`: boolean; true only after explicit opt-in.
- `social.group_size`: one of solo, small, medium, large.
- `student.uconn_stamford`: boolean; true only after explicit UConn Stamford context.

Never propose phone data, contact details, exact home address, age, protected traits, diagnoses, political or religious views, sexuality, or facts about other people.
