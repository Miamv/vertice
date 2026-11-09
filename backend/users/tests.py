import shutil
import tempfile
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import Contact, Media, ProfessionalProfile, Project, StudioAbout, TeamMember

User = get_user_model()

VALID_GIF = (
    b'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!'
    b'\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x01D\x00;'
)


class AuthTestCase(APITestCase):
    def test_register_creates_viewer_role(self):
        response = self.client.post(
            reverse('auth_register'),
            {
                'username': 'newuser',
                'email': 'newuser@example.com',
                'password': 'securepass123',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='newuser')
        self.assertEqual(user.role, User.RoleChoices.VIEWER)

    def test_register_duplicate_email_rejected(self):
        User.objects.create_user(
            username='existing',
            email='dupe@example.com',
            password='securepass123',
        )
        response = self.client.post(
            reverse('auth_register'),
            {
                'username': 'newuser',
                'email': 'dupe@example.com',
                'password': 'securepass123',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_and_refresh(self):
        User.objects.create_user(
            username='jdoe',
            email='jdoe@example.com',
            password='securepass123',
        )
        response = self.client.post(
            reverse('token_obtain_pair'),
            {'username': 'jdoe', 'password': 'securepass123'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        access = response.data['access']
        refresh = response.data['refresh']

        refresh_response = self.client.post(
            reverse('token_refresh'),
            {'refresh': refresh},
            format='json',
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn('access', refresh_response.data)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        profile = self.client.get(reverse('user_profile'))
        self.assertEqual(profile.status_code, status.HTTP_200_OK)
        self.assertEqual(profile.data['username'], 'jdoe')

    def test_profile_requires_authentication(self):
        response = self.client.get(reverse('user_profile'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self):
        user = User.objects.create_user(
            username='jdoe',
            email='jdoe@example.com',
            password='securepass123',
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        logout = self.client.post(
            reverse('auth_logout'),
            {'refresh': str(refresh)},
            format='json',
        )
        self.assertEqual(logout.status_code, status.HTTP_205_RESET_CONTENT)

        refresh_response = self.client.post(
            reverse('token_refresh'),
            {'refresh': str(refresh)},
            format='json',
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_refresh_field(self):
        user = User.objects.create_user(
            username='jdoe',
            email='jdoe@example.com',
            password='securepass123',
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        response = self.client.post(reverse('auth_logout'), {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class RolePermissionTestCase(APITestCase):
    def setUp(self):
        self.temp_media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.temp_media)
        self.override.enable()

        self.profile = ProfessionalProfile.objects.create(name='Estudio Uno')
        self.other_profile = ProfessionalProfile.objects.create(name='Estudio Dos')

        self.admin = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='securepass123',
            role=User.RoleChoices.ADMIN,
        )
        self.owner_one = User.objects.create_user(
            username='owner_one',
            email='owner1@example.com',
            password='securepass123',
            role=User.RoleChoices.OWNER,
        )
        self.profile.users.add(self.owner_one)

        self.collab_one = User.objects.create_user(
            username='collab_one',
            email='collab1@example.com',
            password='securepass123',
            role=User.RoleChoices.COLLABORATOR,
        )
        self.profile.users.add(self.collab_one)

        self.viewer = User.objects.create_user(
            username='viewer',
            email='viewer@example.com',
            password='securepass123',
            role=User.RoleChoices.VIEWER,
        )

        self.project_one = Project.objects.create(
            profile=self.profile,
            title='Obra Estudio Uno',
            description='Memoria',
            category='architecture',
        )
        self.project_two = Project.objects.create(
            profile=self.other_profile,
            title='Obra Estudio Dos',
            description='Memoria',
            category='architecture',
        )

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.temp_media, ignore_errors=True)

    def _auth(self, user):
        refresh = RefreshToken.for_user(user)
        return {'HTTP_AUTHORIZATION': f'Bearer {refresh.access_token}'}

    def _project_payload(self, profile_id=None):
        return {
            'profile': profile_id or self.profile.id,
            'title': 'Proyecto',
            'description': 'Descripción',
            'category': 'architecture',
        }

    def test_viewer_cannot_create_project(self):
        response = self.client.post(
            '/api/projects/',
            self._project_payload(),
            format='json',
            **self._auth(self.viewer),
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_project_in_any_profile(self):
        response = self.client.post(
            '/api/projects/',
            self._project_payload(profile_id=self.other_profile.id),
            format='json',
            **self._auth(self.admin),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_owner_can_create_project_in_own_profile_but_not_foreign_profile(self):
        own_res = self.client.post(
            '/api/projects/',
            self._project_payload(profile_id=self.profile.id),
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(own_res.status_code, status.HTTP_201_CREATED)

        foreign_res = self.client.post(
            '/api/projects/',
            self._project_payload(profile_id=self.other_profile.id),
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(foreign_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_collaborator_cannot_create_project_but_can_upload_media_to_own_project(self):
        proj_res = self.client.post(
            '/api/projects/',
            self._project_payload(profile_id=self.profile.id),
            format='json',
            **self._auth(self.collab_one),
        )
        self.assertEqual(proj_res.status_code, status.HTTP_403_FORBIDDEN)

        own_media_res = self.client.post(
            '/api/media/',
            {
                'project': self.project_one.id,
                'file': SimpleUploadedFile('render.gif', VALID_GIF, content_type='image/gif'),
                'media_type': 'render',
            },
            format='multipart',
            **self._auth(self.collab_one),
        )
        self.assertEqual(own_media_res.status_code, status.HTTP_201_CREATED)

        foreign_media_res = self.client.post(
            '/api/media/',
            {
                'project': self.project_two.id,
                'file': SimpleUploadedFile('render2.gif', VALID_GIF, content_type='image/gif'),
                'media_type': 'render',
            },
            format='multipart',
            **self._auth(self.collab_one),
        )
        self.assertEqual(foreign_media_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_can_list_projects(self):
        response = self.client.get('/api/projects/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_profile_lookup_by_slug_and_pk_and_inactive_filtering(self):
        # 1. Resolución por slug público
        res_slug = self.client.get(f'/api/profiles/{self.profile.slug}/')
        self.assertEqual(res_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(res_slug.data['slug'], 'estudio-uno')
        self.assertEqual(res_slug.data['name'], 'Estudio Uno')
        # Verificar que `users` no se expone públicamente
        self.assertNotIn('users', res_slug.data)

        # 2. Resolución retrocompatible por ID numérico
        res_pk = self.client.get(f'/api/profiles/{self.profile.id}/')
        self.assertEqual(res_pk.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pk.data['id'], self.profile.id)

        # 3. Slug inexistente devuelve 404
        res_404 = self.client.get('/api/profiles/estudio-inexistente/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Estudio inactivo devuelve 404 para público pero es accesible por ADMIN
        self.other_profile.is_active = False
        self.other_profile.save()

        res_inactive_anon = self.client.get(f'/api/profiles/{self.other_profile.slug}/')
        self.assertEqual(res_inactive_anon.status_code, status.HTTP_404_NOT_FOUND)

        res_inactive_admin = self.client.get(
            f'/api/profiles/{self.other_profile.slug}/',
            **self._auth(self.admin),
        )
        self.assertEqual(res_inactive_admin.status_code, status.HTTP_200_OK)

    def test_public_endpoints_isolate_data_by_profile_slug_and_reject_cross_studio_project_detail(self):
        about_a = StudioAbout.objects.create(profile=self.profile, title='Nosotros Uno')
        StudioAbout.objects.create(profile=self.other_profile, title='Nosotros Dos')

        member_a = TeamMember.objects.create(profile=self.profile, full_name='Arq. Uno', role='Socio')
        TeamMember.objects.create(profile=self.other_profile, full_name='Arq. Dos', role='Socio')

        media_a = Media.objects.create(
            project=self.project_one,
            file=SimpleUploadedFile('a.gif', VALID_GIF, content_type='image/gif'),
            media_type='render',
        )
        Media.objects.create(
            project=self.project_two,
            file=SimpleUploadedFile('b.gif', VALID_GIF, content_type='image/gif'),
            media_type='render',
        )

        # Proyectos filtrados por profile_slug=estudio-uno
        proj_res = self.client.get('/api/projects/?profile_slug=estudio-uno')
        self.assertEqual(proj_res.status_code, status.HTTP_200_OK)
        self.assertEqual([p['id'] for p in proj_res.data], [self.project_one.id])
        self.assertEqual(proj_res.data[0]['profile_slug'], 'estudio-uno')
        self.assertEqual(proj_res.data[0]['profile_name'], 'Estudio Uno')
        self.assertNotIn('brands', proj_res.data[0])
        self.assertNotIn('brand_ids', proj_res.data[0])

        # Detalle de proyecto ajeno bajo profile_slug=estudio-uno devuelve 404
        cross_detail = self.client.get(
            f'/api/projects/{self.project_two.id}/?profile_slug=estudio-uno'
        )
        self.assertEqual(cross_detail.status_code, status.HTTP_404_NOT_FOUND)

        # Detalle de proyecto propio bajo profile_slug=estudio-uno devuelve 200
        own_detail = self.client.get(
            f'/api/projects/{self.project_one.id}/?profile_slug=estudio-uno'
        )
        self.assertEqual(own_detail.status_code, status.HTTP_200_OK)

        # About, Team y Media filtrados por profile_slug=estudio-uno
        about_res = self.client.get('/api/about/?profile_slug=estudio-uno')
        self.assertEqual([a['id'] for a in about_res.data], [about_a.id])

        team_res = self.client.get('/api/team/?profile_slug=estudio-uno')
        self.assertEqual([m['id'] for m in team_res.data], [member_a.id])

        media_res = self.client.get('/api/media/?profile_slug=estudio-uno')
        self.assertEqual([m['id'] for m in media_res.data], [media_a.id])

        # El endpoint /api/brands/ fue eliminado definitivamente (404 Not Found)
        brands_res = self.client.get('/api/brands/')
        self.assertEqual(brands_res.status_code, status.HTTP_404_NOT_FOUND)

    def test_profile_and_studio_content_hardened_permissions(self):
        # 1. OWNER no puede crear ni eliminar un ProfessionalProfile
        create_prof_res = self.client.post(
            '/api/profiles/',
            {'name': 'Estudio Nuevo Ilegal'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(create_prof_res.status_code, status.HTTP_403_FORBIDDEN)

        delete_prof_res = self.client.delete(
            f'/api/profiles/{self.profile.slug}/',
            **self._auth(self.owner_one),
        )
        self.assertEqual(delete_prof_res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. OWNER puede actualizar datos de su propio estudio pero no cambiar slug ni is_active
        update_own_res = self.client.patch(
            f'/api/profiles/{self.profile.slug}/',
            {
                'contact_email': 'contacto@vertice.com',
                'phone': '+54 9 261 555-1234',
                'location': 'Mendoza, Argentina',
                'instagram': '@vertice.estudio',
                'specialty': 'Arquitectura Sustentable',
            },
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(update_own_res.status_code, status.HTTP_200_OK)
        self.assertEqual(update_own_res.data['contact_email'], 'contacto@vertice.com')
        self.assertEqual(update_own_res.data['phone'], '+54 9 261 555-1234')
        self.assertEqual(update_own_res.data['location'], 'Mendoza, Argentina')
        self.assertEqual(update_own_res.data['instagram'], '@vertice.estudio')

        change_slug_res = self.client.patch(
            f'/api/profiles/{self.profile.slug}/',
            {'slug': 'nuevo-slug-no-permitido'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(change_slug_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. OWNER no puede actualizar otro estudio ni crear StudioAbout/TeamMember en estudio ajeno
        update_foreign_res = self.client.patch(
            f'/api/profiles/{self.other_profile.slug}/',
            {'phone': '+5492619999999'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(update_foreign_res.status_code, status.HTTP_403_FORBIDDEN)

        foreign_about_res = self.client.post(
            '/api/about/',
            {'profile': self.other_profile.id, 'title': 'Intruso'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(foreign_about_res.status_code, status.HTTP_403_FORBIDDEN)

        own_team_res = self.client.post(
            '/api/team/',
            {'profile': self.profile.id, 'full_name': 'Arq. Propio', 'role': 'Director'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(own_team_res.status_code, status.HTTP_201_CREATED)

    def test_profile_visibility_by_role_admin_owner_collaborator_viewer(self):
        # 1. ADMIN ve todos los estudios en el listado
        admin_list = self.client.get('/api/profiles/', **self._auth(self.admin))
        self.assertEqual(admin_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(admin_list.data), 2)

        # 2. OWNER y COLLABORATOR solo ven el estudio al que están asociados y reciben 404 en un estudio ajeno
        owner_list = self.client.get('/api/profiles/', **self._auth(self.owner_one))
        self.assertEqual([p['id'] for p in owner_list.data], [self.profile.id])

        collab_list = self.client.get('/api/profiles/', **self._auth(self.collab_one))
        self.assertEqual([p['id'] for p in collab_list.data], [self.profile.id])

        owner_foreign_detail = self.client.get(
            f'/api/profiles/{self.other_profile.slug}/',
            **self._auth(self.owner_one),
        )
        self.assertEqual(owner_foreign_detail.status_code, status.HTTP_404_NOT_FOUND)

        # 3. VIEWER y visitante anónimo: en listado sin slug solo reciben 1 estudio (no el catálogo completo),
        # pero pueden acceder directamente por el link `/api/profiles/<slug>/` del estudio que les compartieron.
        viewer_list = self.client.get('/api/profiles/', **self._auth(self.viewer))
        self.assertEqual(len(viewer_list.data), 1)

        anon_list = self.client.get('/api/profiles/')
        self.assertEqual(len(anon_list.data), 1)

        viewer_direct_link = self.client.get(
            f'/api/profiles/{self.other_profile.slug}/',
            **self._auth(self.viewer),
        )
        self.assertEqual(viewer_direct_link.status_code, status.HTTP_200_OK)
        self.assertEqual(viewer_direct_link.data['slug'], self.other_profile.slug)

    def test_etapa4_two_owners_dashboard_isolation_id_manipulation_and_quote_request(self):
        owner_two = User.objects.create_user(
            username='owner_two',
            email='owner2@example.com',
            password='securepass123',
            role=User.RoleChoices.OWNER,
        )
        self.other_profile.users.add(owner_two)

        # Crear recursos del Estudio Uno y Estudio Dos
        about_one = StudioAbout.objects.create(
            profile=self.profile,
            title='Nosotros Uno',
            description='Sub Uno',
        )
        about_two = StudioAbout.objects.create(
            profile=self.other_profile,
            title='Nosotros Dos',
            description='Sub Dos',
        )
        member_one = TeamMember.objects.create(
            profile=self.profile,
            full_name='Integrante Uno',
            role='Arquitecta',
        )
        TeamMember.objects.create(
            profile=self.other_profile,
            full_name='Integrante Dos',
            role='Ingeniero',
        )

        # 1. Aislamiento en dashboard por ?profile=<id> (incluso para ADMIN, no mezcla estudios)
        admin_projects_one = self.client.get(
            f'/api/projects/?profile={self.profile.id}',
            **self._auth(self.admin),
        )
        self.assertEqual([p['id'] for p in admin_projects_one.data], [self.project_one.id])

        admin_projects_two = self.client.get(
            f'/api/projects/?profile={self.other_profile.id}',
            **self._auth(self.admin),
        )
        self.assertEqual([p['id'] for p in admin_projects_two.data], [self.project_two.id])

        admin_team_one = self.client.get(
            f'/api/team/?profile={self.profile.id}',
            **self._auth(self.admin),
        )
        self.assertEqual([m['id'] for m in admin_team_one.data], [member_one.id])

        admin_about_two = self.client.get(
            f'/api/about/?profile={self.other_profile.id}',
            **self._auth(self.admin),
        )
        self.assertEqual([a['id'] for a in admin_about_two.data], [about_two.id])

        # 2. Manipulación de IDs de perfil al actualizar recursos propios -> 403 Forbidden
        hijack_team_res = self.client.patch(
            f'/api/team/{member_one.id}/',
            {'profile': self.other_profile.id, 'full_name': 'Transferido'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(hijack_team_res.status_code, status.HTTP_403_FORBIDDEN)

        hijack_about_res = self.client.patch(
            f'/api/about/{about_one.id}/',
            {'profile': self.other_profile.id, 'title': 'Robado'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(hijack_about_res.status_code, status.HTTP_403_FORBIDDEN)

        hijack_project_res = self.client.patch(
            f'/api/projects/{self.project_one.id}/',
            {'profile': self.other_profile.id},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(hijack_project_res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Intento de owner_two de editar recursos de owner_one -> 403 Forbidden
        cross_edit_team = self.client.patch(
            f'/api/team/{member_one.id}/',
            {'full_name': 'Intruso'},
            format='json',
            **self._auth(owner_two),
        )
        self.assertEqual(cross_edit_team.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Solicitud de presupuesto (Contact / QuoteRequest) vinculada a cada estudio y aislada por owner
        quote_one = self.client.post(
            '/api/contacts/',
            {
                'profile': self.profile.id,
                'name': 'Cliente Uno',
                'email': 'cliente1@test.com',
                'message': 'Consulta para Estudio Uno',
            },
            format='json',
            **self._auth(self.viewer),
        )
        self.assertEqual(quote_one.status_code, status.HTTP_201_CREATED)

        quote_two = self.client.post(
            '/api/contacts/',
            {
                'profile': self.other_profile.id,
                'name': 'Cliente Dos',
                'email': 'cliente2@test.com',
                'message': 'Consulta para Estudio Dos',
            },
            format='json',
            **self._auth(self.viewer),
        )
        self.assertEqual(quote_two.status_code, status.HTTP_201_CREATED)

        # owner_one solo ve las consultas de su estudio, y ADMIN filtra por ?profile=<id>
        owner_one_contacts = self.client.get('/api/contacts/', **self._auth(self.owner_one))
        self.assertEqual([c['id'] for c in owner_one_contacts.data], [quote_one.data['id']])

        owner_two_contacts = self.client.get('/api/contacts/', **self._auth(owner_two))
        self.assertEqual([c['id'] for c in owner_two_contacts.data], [quote_two.data['id']])

        admin_contacts_two = self.client.get(
            f'/api/contacts/?profile={self.other_profile.id}',
            **self._auth(self.admin),
        )
        self.assertEqual([c['id'] for c in admin_contacts_two.data], [quote_two.data['id']])

        # 5. VIEWER no puede listar ni leer consultas aunque su email coincida con el remitente
        spoof_viewer = User.objects.create_user(
            username='spoof_viewer',
            email='cliente1@test.com',
            password='securepass123',
            role=User.RoleChoices.VIEWER,
        )
        viewer_list_contacts = self.client.get('/api/contacts/', **self._auth(spoof_viewer))
        self.assertEqual(viewer_list_contacts.status_code, status.HTTP_403_FORBIDDEN)

        viewer_detail_contact = self.client.get(
            f'/api/contacts/{quote_one.data["id"]}/',
            **self._auth(spoof_viewer),
        )
        self.assertEqual(viewer_detail_contact.status_code, status.HTTP_403_FORBIDDEN)

    def test_numeric_slug_does_not_collide_with_another_profile_id(self):
        numeric_slug = str(self.profile.id)
        numeric_studio = ProfessionalProfile.objects.create(
            name='Estudio Numérico',
            slug=numeric_slug,
        )

        # 1. Endpoint dedicado `/api/profiles/by-slug/<slug>/` resuelve inequívocamente por slug
        res_by_slug = self.client.get(f'/api/profiles/by-slug/{numeric_slug}/')
        self.assertEqual(res_by_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(res_by_slug.data['id'], numeric_studio.id)
        self.assertEqual(res_by_slug.data['slug'], numeric_slug)

        # 2. La ruta de detalle numérica `/api/profiles/<id>/` opera por ID (GET/PATCH/DELETE)
        # sobre `self.profile` sin colisionar con `numeric_studio`
        res_patch_by_id = self.client.patch(
            f'/api/profiles/{self.profile.id}/',
            {'specialty': 'Actualizado por ID sin colisión'},
            format='json',
            **self._auth(self.admin),
        )
        self.assertEqual(res_patch_by_id.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch_by_id.data['id'], self.profile.id)
        self.profile.refresh_from_db()
        numeric_studio.refresh_from_db()
        self.assertEqual(self.profile.specialty, 'Actualizado por ID sin colisión')
        self.assertEqual(numeric_studio.specialty, '')

    def test_project_google_earth_and_location_managed_only_by_admin_and_own_studio_owner(self):
        # 1. OWNER de su propio estudio puede actualizar location y google_earth_url
        owner_res = self.client.patch(
            f'/api/projects/{self.project_one.id}/',
            {
                'location': 'Chacras de Coria, Mendoza',
                'google_earth_url': 'https://earth.google.com/web/search/Chacras+de+Coria',
            },
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(owner_res.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_res.data['location'], 'Chacras de Coria, Mendoza')
        self.assertEqual(
            owner_res.data['google_earth_url'],
            'https://earth.google.com/web/search/Chacras+de+Coria',
        )

        # 2. COLLABORATOR del mismo estudio NO puede modificar google_earth_url ni location (403)
        collab_res = self.client.patch(
            f'/api/projects/{self.project_one.id}/',
            {'google_earth_url': 'https://earth.google.com/web/search/Otro+Lugar'},
            format='json',
            **self._auth(self.collab_one),
        )
        self.assertEqual(collab_res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. OWNER no puede modificar google_earth_url de un proyecto ajeno (403)
        foreign_owner_res = self.client.patch(
            f'/api/projects/{self.project_two.id}/',
            {'google_earth_url': 'https://earth.google.com/web/search/Intruso'},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(foreign_owner_res.status_code, status.HTTP_403_FORBIDDEN)

        # 4. ADMIN puede modificar google_earth_url de cualquier proyecto
        admin_res = self.client.patch(
            f'/api/projects/{self.project_two.id}/',
            {
                'location': 'Bariloche, Río Negro',
                'google_earth_url': 'https://earth.google.com/web/search/Bariloche',
            },
            format='json',
            **self._auth(self.admin),
        )
        self.assertEqual(admin_res.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_res.data['location'], 'Bariloche, Río Negro')

    def test_contact_management_status_project_association_and_filters(self):
        # 1. Creación pública ignora estado forzado y arranca siempre en 'pending'
        create_res = self.client.post(
            '/api/contacts/',
            {
                'profile': self.profile.id,
                'project': self.project_one.id,
                'name': 'Interesado Uno',
                'email': 'interesado1@test.com',
                'message': 'Consulta sobre Proyecto Uno',
                'status': 'closed',
            },
            format='json',
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_res.data['status'], Contact.StatusChoices.PENDING)
        self.assertEqual(create_res.data['status_display'], 'Pendiente')
        self.assertEqual(create_res.data['project'], self.project_one.id)
        self.assertEqual(create_res.data['project_title'], self.project_one.title)
        contact_id = create_res.data['id']

        # 2. Creación pública rechaza asociar un proyecto de otro estudio (400 Bad Request)
        cross_project_create = self.client.post(
            '/api/contacts/',
            {
                'profile': self.profile.id,
                'project': self.project_two.id,
                'name': 'Interesado Cruzado',
                'email': 'cruzado@test.com',
                'message': 'Intento asociar proyecto ajeno',
            },
            format='json',
        )
        self.assertEqual(cross_project_create.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('project', cross_project_create.data)

        # 3. COLLABORATOR puede listar y ver detalle, pero NO puede actualizar estado ni proyecto (403)
        collab_list = self.client.get('/api/contacts/', **self._auth(self.collab_one))
        self.assertEqual(collab_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(collab_list.data), 1)

        collab_patch = self.client.patch(
            f'/api/contacts/{contact_id}/',
            {'status': Contact.StatusChoices.IN_REVIEW},
            format='json',
            **self._auth(self.collab_one),
        )
        self.assertEqual(collab_patch.status_code, status.HTTP_403_FORBIDDEN)

        # 4. OWNER puede cambiar el estado ('in_review', 'responded', 'closed') y asociar/desasociar proyecto propio
        owner_patch_review = self.client.patch(
            f'/api/contacts/{contact_id}/',
            {'status': Contact.StatusChoices.IN_REVIEW, 'project': None},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(owner_patch_review.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_patch_review.data['status'], Contact.StatusChoices.IN_REVIEW)
        self.assertEqual(owner_patch_review.data['status_display'], 'En revisión')
        self.assertIsNone(owner_patch_review.data['project'])

        owner_patch_responded = self.client.patch(
            f'/api/contacts/{contact_id}/',
            {'status': Contact.StatusChoices.RESPONDED, 'project': self.project_one.id},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(owner_patch_responded.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_patch_responded.data['status'], Contact.StatusChoices.RESPONDED)
        self.assertEqual(owner_patch_responded.data['project'], self.project_one.id)

        # 5. OWNER NO puede asociar un proyecto de otro estudio a su consulta (400 Bad Request)
        owner_foreign_proj = self.client.patch(
            f'/api/contacts/{contact_id}/',
            {'project': self.project_two.id},
            format='json',
            **self._auth(self.owner_one),
        )
        self.assertEqual(owner_foreign_proj.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('project', owner_foreign_proj.data)

        # 6. Filtros por estado, proyecto y rango de fechas
        second_contact = Contact.objects.create(
            profile=self.profile,
            name='Interesado Dos',
            email='interesado2@test.com',
            message='Segunda consulta sin proyecto',
            status=Contact.StatusChoices.CLOSED,
        )

        by_status_responded = self.client.get(
            f'/api/contacts/?status={Contact.StatusChoices.RESPONDED}',
            **self._auth(self.owner_one),
        )
        self.assertEqual([c['id'] for c in by_status_responded.data], [contact_id])

        by_status_closed = self.client.get(
            f'/api/contacts/?status={Contact.StatusChoices.CLOSED}',
            **self._auth(self.owner_one),
        )
        self.assertEqual([c['id'] for c in by_status_closed.data], [second_contact.id])

        by_project_one = self.client.get(
            f'/api/contacts/?project={self.project_one.id}',
            **self._auth(self.owner_one),
        )
        self.assertEqual([c['id'] for c in by_project_one.data], [contact_id])

        by_project_none = self.client.get(
            '/api/contacts/?project=none',
            **self._auth(self.owner_one),
        )
        self.assertEqual([c['id'] for c in by_project_none.data], [second_contact.id])

        today_str = second_contact.created_at.strftime('%Y-%m-%d')
        by_date = self.client.get(
            f'/api/contacts/?date_from={today_str}&date_to={today_str}',
            **self._auth(self.owner_one),
        )
        self.assertEqual(len(by_date.data), 2)

        future_date = '2099-01-01'
        by_future_date = self.client.get(
            f'/api/contacts/?date_from={future_date}',
            **self._auth(self.owner_one),
        )
        self.assertEqual(len(by_future_date.data), 0)




