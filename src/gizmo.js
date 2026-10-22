// 블렌더식 시점 기즈모 (2026-10-22 피드백 '정면·옆 등을 바로 보여 주는 블렌더 기즈모') — Mac판·웹판 같은 파일
//  화면 오른쪽 위 동그란 축 표시: 축 공을 누르면 그 방향에서 보는 시점으로 부드럽게 돌아감, 끌면 회전
//  축 이름·색은 블렌더와 같게 (Z 위 파랑, X 오른쪽 빨강, Y 뒤쪽 초록 — three는 Y가 위라 바꿔 그림)
//  키: 숫자패드 1 정면 · 3 오른쪽 · 7 위 (Ctrl·Cmd와 같이 누르면 반대쪽) · 9 반대편 (블렌더와 같음)
import * as THREE from 'three';

// three 방향 → 블렌더 이름 (화면에 보이는 글자)
const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), label: 'X', color: '#ff3653', view: '오른쪽' },
  { dir: new THREE.Vector3(-1, 0, 0), label: '-X', color: '#ff3653', view: '왼쪽' },
  { dir: new THREE.Vector3(0, 1, 0), label: 'Z', color: '#2c8fff', view: '위' },
  { dir: new THREE.Vector3(0, -1, 0), label: '-Z', color: '#2c8fff', view: '아래' },
  { dir: new THREE.Vector3(0, 0, -1), label: 'Y', color: '#8bdc00', view: '뒤' },
  { dir: new THREE.Vector3(0, 0, 1), label: '-Y', color: '#8bdc00', view: '정면' },
];

export class ViewGizmo {
	// opts: { size(px), parent(요소), style(위치 CSS), onView(시점 이름) }
	constructor( camera, controls, opts = {} ) {
		this.camera = camera; this.controls = controls; this.opts = opts;
		this.size = opts.size ?? 96;
		const c = this.canvas = document.createElement( 'canvas' );
		const dpr = Math.min( devicePixelRatio, 2 );
		c.width = c.height = this.size * dpr; this.dpr = dpr;
		Object.assign( c.style, { position: 'fixed', width: this.size + 'px', height: this.size + 'px', zIndex: 6, touchAction: 'none', cursor: 'pointer', borderRadius: '50%' }, opts.style ?? { right: '12px', top: '52px' } );
		c.title = '시점: 축을 누르면 그 방향에서 보기 · 끌면 회전 (숫자패드 1 정면 · 3 오른쪽 · 7 위, Ctrl 같이 = 반대쪽)';
		( opts.parent ?? document.body ).appendChild( c );
		this.hover = -1; this.anim = null; this.hit = [];
		this._bind();
	}

	get cam() { return this.camera; }

	_bind() {
		const c = this.canvas;
		let drag = null;
		const at = ( e ) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
		c.addEventListener( 'pointerdown', ( e ) => { e.stopPropagation(); c.setPointerCapture( e.pointerId ); drag = { sx: e.clientX, sy: e.clientY, moved: false, lx: e.clientX, ly: e.clientY }; } );
		c.addEventListener( 'pointermove', ( e ) => {
			const p = at( e );
			if ( drag ) {
				const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
				if ( Math.abs( e.clientX - drag.sx ) + Math.abs( e.clientY - drag.sy ) > 4 ) drag.moved = true; // 4px 넘게 움직이면 끌기
				if ( drag.moved ) this._orbit( dx, dy );
				drag.lx = e.clientX; drag.ly = e.clientY;
			} else this.hover = this._pick( p );
		} );
		c.addEventListener( 'pointerup', ( e ) => {
			if ( drag && ! drag.moved ) { const i = this._pick( at( e ) ); if ( i >= 0 ) this.snap( AXES[ this.hit[ i ].k ].dir, AXES[ this.hit[ i ].k ].view ); }
			drag = null;
		} );
		c.addEventListener( 'pointerleave', () => { this.hover = -1; } );
		addEventListener( 'keydown', ( e ) => {
			if ( e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ) return;
			const opp = e.ctrlKey || e.metaKey;
			if ( e.code === 'Numpad1' ) { e.preventDefault(); this.snapIdx( opp ? 4 : 5 ); }
			else if ( e.code === 'Numpad3' ) { e.preventDefault(); this.snapIdx( opp ? 1 : 0 ); }
			else if ( e.code === 'Numpad7' ) { e.preventDefault(); this.snapIdx( opp ? 3 : 2 ); }
			else if ( e.code === 'Numpad9' ) { e.preventDefault(); const d = this._offset().normalize().negate(); this.snap( d, '반대편' ); }
		} );
	}

	snapIdx( i ) { this.snap( AXES[ i ].dir, AXES[ i ].view ); }

	_offset() { return this.cam.position.clone().sub( this.controls.target ); }

	// 끌어서 돌리기 (OrbitControls와 같은 방향)
	_orbit( dx, dy ) {
		const off = this._offset(), s = new THREE.Spherical().setFromVector3( off );
		s.theta -= dx * 0.012; s.phi = THREE.MathUtils.clamp( s.phi - dy * 0.012, 1e-3, Math.PI - 1e-3 );
		off.setFromSpherical( s ); this.cam.position.copy( this.controls.target ).add( off ); this.cam.lookAt( this.controls.target );
		this.anim = null;
	}

	// 그 방향(목표 → 카메라)에서 보기 — 거리는 그대로, 0.25초 동안 구면 보간
	snap( dir, name ) {
		const off = this._offset(), dist = off.length();
		let to = dir.clone().normalize();
		// 바로 위·아래는 OrbitControls가 뒤집히지 않게 아주 조금 앞으로
		if ( Math.abs( to.y ) > 0.999 ) to = new THREE.Vector3( 0, Math.sign( to.y ), 1e-3 ).normalize();
		this.anim = { from: off.clone().normalize(), to, dist, t0: performance.now() };
		this.opts.onView?.( name );
	}

	// 프레임마다 (렌더 전에)
	update() {
		const a = this.anim;
		if ( a ) {
			const k = Math.min( 1, ( performance.now() - a.t0 ) / 250 ), e = k * k * ( 3 - 2 * k );
			const q = new THREE.Quaternion().setFromUnitVectors( a.from, a.to ), qi = new THREE.Quaternion().slerp( q, e );
			const d = a.from.clone().applyQuaternion( qi ).multiplyScalar( a.dist );
			this.cam.position.copy( this.controls.target ).add( d ); this.cam.lookAt( this.controls.target );
			if ( k >= 1 ) this.anim = null;
		}
		this._draw();
	}

	_draw() {
		const g = this.canvas.getContext( '2d' ), S = this.size, dpr = this.dpr, R = S / 2, r = R - 14;
		g.setTransform( dpr, 0, 0, dpr, 0, 0 ); g.clearRect( 0, 0, S, S );
		if ( this.hover >= 0 || this.anim ) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc( R, R, R - 1, 0, Math.PI * 2 ); g.fill(); }
		const inv = this.cam.quaternion.clone().invert();
		this.hit = AXES.map( ( ax, k ) => { const v = ax.dir.clone().applyQuaternion( inv ); return { k, x: R + v.x * r, y: R - v.y * r, z: v.z }; } ).sort( ( a, b ) => a.z - b.z );
		// 양의 축 선
		for ( const h of this.hit ) { const ax = AXES[ h.k ]; if ( ax.label.startsWith( '-' ) ) continue; g.strokeStyle = ax.color; g.lineWidth = 2; g.beginPath(); g.moveTo( R, R ); g.lineTo( h.x, h.y ); g.stroke(); }
		this.hit.forEach( ( h, i ) => {
			const ax = AXES[ h.k ], neg = ax.label.startsWith( '-' ), hov = this.hover === i, rad = neg ? 7.5 : 9.5;
			g.beginPath(); g.arc( h.x, h.y, rad + ( hov ? 1.5 : 0 ), 0, Math.PI * 2 );
			if ( neg ) { g.fillStyle = hov ? ax.color : ax.color + '55'; g.fill(); g.strokeStyle = ax.color; g.lineWidth = 1.5; g.stroke(); }
			else { g.fillStyle = ax.color; g.fill(); }
			if ( ! neg || hov ) { g.fillStyle = neg ? '#fff' : '#111'; g.font = `bold ${ neg ? 8 : 10 }px -apple-system, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText( ax.label, h.x, h.y + 0.5 ); }
		} );
	}

	// 맨 앞(카메라 쪽)부터 판정
	_pick( p ) {
		for ( let i = this.hit.length - 1; i >= 0; i -- ) { const h = this.hit[ i ]; if ( ( p.x - h.x ) ** 2 + ( p.y - h.y ) ** 2 < 13 * 13 ) return i; }
		return -1;
	}

	dispose() { this.canvas.remove(); }
}
