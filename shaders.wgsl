struct BlendUniforms {
  mix_value: f32,
  _pad0: vec3<f32>,
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var destination_texture: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var<uniform> blend_uniforms: BlendUniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );

  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  output.uv = uvs[vertex_index];
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let source_color = textureSample(source_texture, linear_sampler, input.uv);
  let destination_color = textureSample(destination_texture, linear_sampler, input.uv);
  return mix(source_color, destination_color, blend_uniforms.mix_value);
}

struct WarpUniforms {
  width: u32,
  height: u32,
  t_value: f32,
  interpolation_mode: u32,
}

@group(1) @binding(0) var warp_source: texture_2d<f32>;
@group(1) @binding(1) var warp_sampler: sampler;
@group(1) @binding(2) var warp_output: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(3) var<uniform> warp_uniforms: WarpUniforms;

@compute @workgroup_size(8, 8, 1)
fn inverse_map_stub(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= warp_uniforms.width || gid.y >= warp_uniforms.height) {
    return;
  }

  let width_safe = max(1.0, f32(warp_uniforms.width - 1u));
  let height_safe = max(1.0, f32(warp_uniforms.height - 1u));
  let uv = vec2<f32>(f32(gid.x) / width_safe, f32(gid.y) / height_safe);
  let color = textureSampleLevel(warp_source, warp_sampler, uv, 0.0);
  textureStore(warp_output, vec2<i32>(i32(gid.x), i32(gid.y)), color);
}
