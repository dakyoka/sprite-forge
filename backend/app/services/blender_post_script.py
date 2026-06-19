"""
Blender Python スクリプト（--background モードで実行される）
引数: <input.glb> <output.glb>
"""
import sys
import bpy


def main(input_path: str, output_path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # GLB インポート
    bpy.ops.import_scene.gltf(filepath=input_path)

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]

    # 原点を底面に移動
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        # バウンディングボックスの最下点を原点にする
        min_z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
        obj.location.z -= min_z
        bpy.ops.object.transform_apply(location=True)
        obj.select_set(False)

    # マテリアル後処理
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Emission Strength"].default_value = 0.0
                    node.inputs["Roughness"].default_value = 0.8

    # GLB エクスポート
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_materials="EXPORT",
        export_animations=False,
    )
    print(f"Blender: exported → {output_path}")


if __name__ == "__main__":
    argv = sys.argv
    args = argv[argv.index("--") + 1:]
    main(args[0], args[1])
