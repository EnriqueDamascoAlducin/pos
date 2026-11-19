<?php

test('la raíz manda al sistema y, sin sesión, al login', function () {
    $this->get(route('home'))->assertRedirect('/dashboard');
    $this->get('/dashboard')->assertRedirect(route('login'));
});
