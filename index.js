const BACKGROUND = "#101010"
const FOREGROUND = "#50FF50"

console.log(game)
game.width = 800
game.height = 800
const ctx = game.getContext("2d")
console.log(ctx)

function clear() {
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, game.width, game.height)
}

function point({x, y}) {
    const s = 20;
    ctx.fillStyle = FOREGROUND
    ctx.fillRect(x - s/2, y - s/2, s, s)
}

function line(p1, p2) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = FOREGROUND
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

// Fill a polygon face with a color
function fillFace(points, color) {
    if (points.length < 3) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    // Also draw edges for that wireframe look
    ctx.strokeStyle = FOREGROUND;
    ctx.lineWidth = 1;
    ctx.stroke();
}

function screen(p) {
    // -1..1 => 0..2 => 0..1 => 0..w
    return {
        x: (p.x + 1)/2*game.width,
        y: (1 - (p.y + 1)/2)*game.height,
    }
}

function project({x, y, z}) {
    return {
        x: x/z,
        y: y/z,
    }
}

const FPS = 60;

function translate_z({x, y, z}, dz) {
    return {x, y, z: z + dz};
}

function rotate_xz({x, y, z}, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x*c-z*s,
        y,
        z: x*s+z*c,
    };
}

// ============================================
// Z-FILTERING: The Painter's Algorithm + Back-face Culling
// ============================================

// Vector subtraction: a - b
function vec_sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

// Cross product: a × b (gives normal vector perpendicular to both)
function vec_cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

// Dot product: a · b (tells us if vectors point same direction)
function vec_dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

// Calculate average Z of a face (center depth for sorting)
function getFaceDepth(transformedVerts) {
    let sumZ = 0;
    for (const v of transformedVerts) {
        sumZ += v.z;
    }
    return sumZ / transformedVerts.length;
}

// Calculate the center point of a face (for perspective-correct culling)
function getFaceCenter(transformedVerts) {
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const v of transformedVerts) {
        sumX += v.x;
        sumY += v.y;
        sumZ += v.z;
    }
    const n = transformedVerts.length;
    return { x: sumX / n, y: sumY / n, z: sumZ / n };
}

// Calculate face normal using first 3 vertices
// Normal points "outward" from the face
function getFaceNormal(transformedVerts) {
    if (transformedVerts.length < 3) return { x: 0, y: 0, z: 1 };
    
    const v0 = transformedVerts[0];
    const v1 = transformedVerts[1];
    const v2 = transformedVerts[2];
    
    // Two edge vectors
    const edge1 = vec_sub(v1, v0);
    const edge2 = vec_sub(v2, v0);
    
    // Normal is perpendicular to both edges
    return vec_cross(edge1, edge2);
}

// Check if face is pointing toward camera WITH PERSPECTIVE
// Camera is at origin (0,0,0). We need to check if normal points toward camera.
// viewVector = cameraPos - faceCenter = (0,0,0) - faceCenter = -faceCenter
// If dot(normal, viewVector) > 0, face points toward camera (visible)
function isFrontFacing(normal, faceCenter) {
    // Vector from face center TO camera (camera is at origin)
    const viewVector = { 
        x: -faceCenter.x, 
        y: -faceCenter.y, 
        z: -faceCenter.z 
    };
    
    // If normal and view vector point same-ish direction, face is visible
    return vec_dot(normal, viewVector) > 0;
}

// NOTE: The penger model has inconsistent face winding order
// (some faces are clockwise, some counter-clockwise)
// This causes some flickering, but you can see culling in action!
// Set to true to enable culling, false to disable
const ENABLE_BACKFACE_CULLING = true;

// HIDDEN LINE REMOVAL: Fill faces with background color to occlude objects behind
// This makes body hide the bill/feet that are behind it!
const ENABLE_OCCLUSION = true;

// Shade color based on face orientation (simple lighting)
function shadeColor(normal) {
    // Simple lighting: faces pointing more toward camera are brighter
    // Normalize the z component and use it for shading
    const len = Math.sqrt(normal.x*normal.x + normal.y*normal.y + normal.z*normal.z);
    if (len === 0) return "#50FF50";
    
    // How much face points toward camera (-Z direction)
    const intensity = Math.abs(normal.z / len);
    
    // Map intensity to green color (0x20 to 0xFF)
    const green = Math.floor(0x30 + intensity * 0xCF);
    return `#20${green.toString(16).padStart(2, '0')}20`;
}

let dz = 1;
let angle = 0;

function frame() {
    const dt = 1/FPS;
    angle += 1*dt;
    clear()
    
    // STEP 1: Transform all vertices once
    const transformedVs = vs.map(v => translate_z(rotate_xz(v, angle), dz));
    
    // STEP 2: Build face data with depth and culling info
    const faceData = [];
    
    for (let fi = 0; fi < fs.length; fi++) {
        const f = fs[fi];
        if (f.length < 3) continue; // Skip edges/lines, only process polygons
        
        // Get transformed vertices for this face
        const faceVerts = f.map(idx => transformedVs[idx]);
        
        // Calculate face normal and center
        const normal = getFaceNormal(faceVerts);
        const center = getFaceCenter(faceVerts);
        
        // BACK-FACE CULLING: Skip faces pointing away from camera
        // Now uses PERSPECTIVE-CORRECT check (view vector from face to camera)
        if (ENABLE_BACKFACE_CULLING && !isFrontFacing(normal, center)) continue;
        
        // Calculate average depth for painter's algorithm
        const depth = getFaceDepth(faceVerts);
        
        // Get screen coordinates
        const screenVerts = faceVerts.map(v => screen(project(v)));
        
        faceData.push({
            depth,
            screenVerts,
            faceIndices: f  // Keep original vertex indices for wireframe
        });
    }
    
    // STEP 3: PAINTER'S ALGORITHM - Sort by depth (furthest first)
    // Faces with LARGER z are further away, draw them first
    faceData.sort((a, b) => b.depth - a.depth);
    
    // STEP 4: Draw faces back-to-front
    // Two-pass rendering for hidden line removal:
    
    for (const face of faceData) {
        const pts = face.screenVerts;
        
        // PASS 1: Fill face with background color (OCCLUSION)
        // This "blocks" any wireframe lines from objects behind this face
        if (ENABLE_OCCLUSION && pts.length >= 3) {
            ctx.fillStyle = BACKGROUND;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
            ctx.fill();
        }
        
        // PASS 2: Draw wireframe edges on top
        for (let i = 0; i < pts.length; i++) {
            line(pts[i], pts[(i + 1) % pts.length]);
        }
    }
    
    setTimeout(frame, 1000/FPS);
}
setTimeout(frame, 1000/FPS);
