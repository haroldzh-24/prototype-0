Pod::Spec.new do |s|
  s.name = 'TrainingMedia'
  s.version = '1.0.0'
  s.summary = 'Training video picker'
  s.description = 'Out-of-process PHPicker video selection that needs no photo library permission.'
  s.license = { :type => 'MIT' }
  s.author = 'Prototype'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PhotosUI', 'UniformTypeIdentifiers', 'UIKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
