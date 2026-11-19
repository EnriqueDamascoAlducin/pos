<?php

use App\Models\Setting;

it('muestra la página 404 de refacciones con el nombre del negocio y enlace al inicio', function () {
    Setting::set('business_name', 'Refaccionaria El Pistón');

    $this->get('/esta-pagina-no-existe')
        ->assertNotFound()
        ->assertSee('Refaccionaria El Pistón')
        ->assertSee('Esta pieza no está en el catálogo')
        ->assertSee('Volver al inicio')
        ->assertSee('href="'.route('home').'"', false);
});

it('el inicio manda al sistema o al login', function () {
    $this->get(route('home'))->assertRedirect('/dashboard');
});
