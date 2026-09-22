"""
Formularios de la app. Se usa un `AuthenticationForm` propio únicamente
para poder aplicarle clases CSS a los campos desde Python (mantiene el
template de login limpio, sin lógica de presentación dispersa).
"""

from django.contrib.auth.forms import AuthenticationForm
from django.forms import TextInput, PasswordInput


class LoginForm(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].widget = TextInput(
            attrs={"class": "campo-input", "placeholder": "Usuario", "autofocus": True}
        )
        self.fields["password"].widget = PasswordInput(
            attrs={"class": "campo-input", "placeholder": "Contraseña"}
        )
