Pod::Spec.new do |s|
  s.name = 'RouteAI'
  s.version = '1.0.0'
  s.summary = 'On-device conversational route interface'
  s.description = 'Apple Foundation Models interpretation and trusted-fact formatting.'
  s.license = { :type => 'MIT' }
  s.author = 'Prototype'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.0'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'OTHER_LDFLAGS' => '$(inherited) -weak_framework FoundationModels' }
end
